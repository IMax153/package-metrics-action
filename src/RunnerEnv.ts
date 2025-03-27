import { context } from "@actions/github"
import { FileSystem, Path } from "@effect/platform"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Config, Effect, Option } from "effect"
import * as OS from "node:os"

export class RunnerEnv extends Effect.Service<RunnerEnv>()("app/RunnerEnv", {
  dependencies: [NodeFileSystem.layer, NodePath.layer],
  effect: Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const tmpDir = yield* Config.string("RUNNER_TEMP").pipe(
      Config.withDefault(OS.tmpdir())
    )

    const mkTmpDir = (filePath: string) => {
      const dir = path.join(tmpDir, filePath)
      return fs.remove(dir, { recursive: true }).pipe(
        Effect.ignore,
        Effect.zipRight(fs.makeDirectory(dir)),
        Effect.as(dir)
      )
    }

    const issue = Option.fromNullable(context.issue.number).pipe(
      Option.as(context.issue)
    )
    const repo = context.payload.repository!
    const comment = Option.fromNullable(context.payload.comment)
    const pull = Option.fromNullable(context.payload.pull_request)
    const actor = context.actor

    const ref = yield* Config.nonEmptyString("GITHUB_HEAD_REF").pipe(
      Config.orElse(() => Config.nonEmptyString("GITHUB_REF_NAME"))
    )

    const isOrigin = Option.isNone(pull) ||
      pull.value.head.repo.owner.login === pull.value.base.repo.owner.login

    return {
      tmpDir,
      mkTmpDir,
      issue,
      repo,
      comment,
      actor,
      pull,
      ref,
      isOrigin
    } as const
  })
}) {}
