import { NodeRuntime } from "@effect/platform-node"
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

  const git = yield* Git

  const baseDir = yield* git.clone(`https://github.com/${repository}.git`, "base")
  const headDir = yield* git.clone(`https://github.com/${repository}.git`, "head")

  console.log({
    baseRef,
    headRef,
    baseDir,
    headDir
  })
})

const MainLayer = Layer.mergeAll(
  Git.Default,
  Rollup.Default
).pipe(Layer.provide(ConfigProviderLayer))

main.pipe(
  Effect.provide(MainLayer),
  NodeRuntime.runMain
)
