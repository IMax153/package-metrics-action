import { FileSystem, Path } from "@effect/platform"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Config, ConfigProvider, Effect, Layer } from "effect"
import { Git } from "./Git.ts"
import { Rollup } from "./Rollup.ts"
import { input } from "./utils/config.ts"

const ConfigProviderLayer = ConfigProvider.fromEnv().pipe(
  ConfigProvider.constantCase,
  Layer.setConfigProvider
)

const main = Effect.gen(function*() {
  const eventName = yield* Config.nonEmptyString("GITHUB_EVENT_NAME")

  if (eventName !== "pull_request") {
    return yield* Effect.dieMessage("Package metrics can only be computed for pull requests")
  }

  const repository = yield* Config.nonEmptyString("GITHUB_REPOSITORY")
  const baseRef = yield* input("base_ref").pipe(
    Config.orElse(() => Config.nonEmptyString("GITHUB_BASE_REF"))
  )
  const headRef = yield* input("head_ref").pipe(
    Config.orElse(() => Config.nonEmptyString("GITHUB_HEAD_REF"))
  )

  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const git = yield* Git

  const baseDir = path.resolve("base")
  const headDir = path.resolve("head")
  yield* git.clone(`https://github.com/${repository}.git`, baseDir)
  yield* git.clone(`https://github.com/${repository}.git`, headDir)

  console.log({
    baseRef,
    headRef,
    baseDir,
    headDir
  })

  const files = yield* fs.readDirectory(process.cwd())
  console.log({ files })

  yield* fs.readDirectory("base").pipe(
    Effect.andThen((files) => console.log({ baseFiles: files })),
    Effect.ignore
  )
})

const MainLayer = Layer.mergeAll(
  NodeContext.layer,
  Git.Default,
  Rollup.Default
).pipe(Layer.provide(ConfigProviderLayer))

main.pipe(
  Effect.tapErrorCause(Effect.logError),
  Effect.provide(MainLayer),
  NodeRuntime.runMain
)
