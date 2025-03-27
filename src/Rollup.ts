import { NodeStream } from "@effect/platform-node"
import { nodeResolve } from "@rollup/plugin-node-resolve"
import * as terser from "@rollup/plugin-terser"
import { Console, Data, Effect, Stream } from "effect"
import { createGzip } from "node:zlib"
import * as Api from "rollup"
import esbuild from "rollup-plugin-esbuild"

export class RollupError extends Data.TaggedError("RollupError")<{
  readonly cause: unknown
}> { }

export class Rollup extends Effect.Service<Rollup>()("app/Rollup", {
  effect: Effect.gen(function*() {
    const onwarn: Api.WarningHandlerWithDefault = (warning, next) => {
      if (warning.code === "THIS_IS_UNDEFINED") {
        return
      }
      next(warning)
    }

    const plugins: Api.InputPluginOption = [
      nodeResolve(),
      esbuild(),
      terser.default({ mangle: true, compress: true })
    ]

    const bundle = Effect.fn("Rollup.bundle")(
      function*(input: string) {
        const bundle = yield* Effect.tryPromise({
          try: () => Api.rollup({ input, onwarn, plugins }),
          catch: (cause) => new RollupError({ cause })
        })

        const encoder = new TextEncoder()

        const chunk = yield* Effect.tryPromise({
          try: () => bundle.generate({ format: "cjs" }),
          catch: (cause) => new RollupError({ cause })
        }).pipe(Effect.map(({ output }) => output[0]))

        const buffer = encoder.encode(chunk.code)

        const sizeInBytes = yield* Stream.succeed(buffer).pipe(
          NodeStream.pipeThroughSimple(() => createGzip()),
          Stream.runFold(0, (size, bytes) => size + bytes.length)
        )

        yield* Console.log({ ...chunk, sizeInBytes })
      }
    )

    return {
      bundle
    } as const
  })
}) { }
