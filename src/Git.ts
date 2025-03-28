import { Config, Data, Effect } from "effect"
import * as SimpleGit from "simple-git"
import { input } from "./utils/config.ts"

export class GitError extends Data.TaggedError("GitError")<{
  readonly cause: SimpleGit.GitError
}> {
  get message() {
    return this.cause.message
  }
}

export class Git extends Effect.Service<Git>()("app/Git", {
  effect: Effect.gen(function*() {
    const githubActor = Config.nonEmptyString("github_actor")

    const githubActorEmail = githubActor.pipe(
      Config.map((actor) => `${actor}@users.noreply.github.com`)
    )

    const userName = yield* input("git_user").pipe(
      Config.orElse(() => githubActor)
    )

    const userEmail = yield* input("git_email").pipe(
      Config.orElse(() => githubActorEmail)
    )

    const clone = Effect.fn("Git.clone")(
      (url: string, directory: string) =>
        Effect.tryPromise({
          try: () => SimpleGit.simpleGit().clone(url, directory),
          catch: (cause) => new GitError({ cause: cause as any })
        })
    )

    const open = Effect.fn("Git.open")(
      function*(directory: string, ref: string) {
        const git = SimpleGit.simpleGit(directory)

        const use = Effect.fn("Git.use", { attributes: { directory } })(
          <A>(f: (git: SimpleGit.SimpleGit) => Promise<A>) =>
            Effect.tryPromise({
              try: () => f(git),
              catch: (cause) => new GitError({ cause: cause as any })
            })
        )

        const getCheckoutInfo = Effect.fn("Git.getCheckoutInfo")(
          function*(ref: string) {
            const lowerRef = ref.toLowerCase()
            if (lowerRef.startsWith("refs/heads/")) {
              const branch = ref.substring("refs/heads/".length)
              return { ref: branch, startPoint: `refs/remotes/origin/${branch}` }
            }
            if (lowerRef.startsWith("refs/pull/")) {
              const branch = ref.substring("refs/pull/".length)
              return { ref: `refs/remotes/pull/${branch}` }
            }
            if (lowerRef.startsWith("refs/tags/")) {
              return { ref }
            }
            if (lowerRef.startsWith("refs/")) {
              return { ref }
            }
            // unqualified ref, check for matching branch or tag
            const branches = yield* use((git) => git.branch(["--list", "--remote", `origin/${ref}`]))
            console.log({ branches })
            if (branches.all.length > 0) {
              return { ref, startPoint: `refs/remotes/origin/${ref}` }
            }
            const tags = yield* use((git) => git.tags(["--list", ref]))
            console.log({ tags })
            if (tags.all.length > 0) {
              return { ref: `refs/tags/${ref}` }
            }
            return yield* new GitError({
              cause: new SimpleGit.GitError(undefined, `Could not find matching ref for ${ref}`)
            })
          }
        )

        yield* use((git) =>
          git
            .addConfig("user.name", userName)
            .addConfig("user.email", userEmail)
        )

        const info = yield* getCheckoutInfo(ref)
        yield* use((git) =>
          info.startPoint
            ? git.checkoutBranch(info.ref, info.startPoint)
            : git.checkout(info.ref).then(() => {})
        )

        return {
          use,
          path: directory
        } as const
      }
    )

    return {
      clone,
      open
    } as const
  })
}) {}
