import { getOctokit } from "@actions/github"
import type { RequestError } from "@octokit/types"
import type { Api } from "@octokit/plugin-rest-endpoint-methods"
import { Data, Effect, Redacted, Schedule } from "effect"
import { inputSecret } from "./utils/config.js"

export class GithubError extends Data.TaggedError("GithubError")<{
  readonly reason: RequestError
}> { }

export class Github extends Effect.Service<Github>()("app/Github", {
  effect: Effect.gen(function*() {
    const token = yield* inputSecret("github_token")
    const client = getOctokit(Redacted.value(token))

    const request = Effect.fn("Github.request")(
      <A>(f: (client: Api["rest"]) => Promise<A>) =>
        Effect.tryPromise({
          try: () => f(client.rest as any),
          catch: (reason) => new GithubError({ reason: reason as any })
        }).pipe(
          Effect.retry({
            while: (err) =>
              err.reason.status === 403 ||
              err.reason.status === 429 ||
              err.reason.status >= 500,
            schedule: Schedule.exponential("1 second").pipe(
              Schedule.union(Schedule.spaced("60 seconds")),
              Schedule.intersect(Schedule.recurs(10))
            )
          })
        )
    )

    return {
      request
    } as const
  })
}) { }
