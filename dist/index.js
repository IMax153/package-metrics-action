'use strict';

var platformNode = require('@effect/platform-node');
var effect = require('effect');
var Function = require('effect/Function');
var SimpleGit = require('simple-git');
var pluginNodeResolve = require('@rollup/plugin-node-resolve');
var terser = require('@rollup/plugin-terser');
var zlib = require('zlib');
var Api = require('rollup');
var esbuild = require('rollup-plugin-esbuild');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var SimpleGit__namespace = /*#__PURE__*/_interopNamespace(SimpleGit);
var terser__default = /*#__PURE__*/_interopDefault(terser);
var Api__namespace = /*#__PURE__*/_interopNamespace(Api);
var esbuild__default = /*#__PURE__*/_interopDefault(esbuild);

// src/index.ts
var input = (name) => effect.Config.nested(effect.Config.nonEmptyString(name), "input");

// src/Git.ts
var GitError2 = class extends effect.Data.TaggedError("GitError") {
  get message() {
    return this.cause.message;
  }
};
var Git = class extends effect.Effect.Service()("app/Git", {
  effect: effect.Effect.gen(function* () {
    const githubActor = effect.Config.nonEmptyString("github_actor");
    const githubActorEmail = githubActor.pipe(
      effect.Config.map((actor) => `${actor}@users.noreply.github.com`)
    );
    const userName = yield* input("git_user").pipe(
      effect.Config.orElse(() => githubActor)
    );
    const userEmail = yield* input("git_email").pipe(
      effect.Config.orElse(() => githubActorEmail)
    );
    const clone = effect.Effect.fn("Git.clone")(
      (url, directory) => effect.Effect.tryPromise({
        try: () => SimpleGit__namespace.simpleGit().clone(url, directory),
        catch: (cause) => new GitError2({ cause })
      })
    );
    const open = effect.Effect.fn("Git.open")(
      function* (directory, ref) {
        const git = SimpleGit__namespace.simpleGit(directory);
        const use = effect.Effect.fn("Git.use", { attributes: { directory } })(
          (f) => effect.Effect.tryPromise({
            try: () => f(git),
            catch: (cause) => new GitError2({ cause })
          })
        );
        const getCheckoutInfo = effect.Effect.fn("Git.getCheckoutInfo")(
          function* (ref2) {
            const lowerRef = ref2.toLowerCase();
            if (lowerRef.startsWith("refs/heads/")) {
              const branch = ref2.substring("refs/heads/".length);
              return { ref: branch, startPoint: `refs/remotes/origin/${branch}` };
            }
            if (lowerRef.startsWith("refs/pull/")) {
              const branch = ref2.substring("refs/pull/".length);
              return { ref: `refs/remotes/pull/${branch}` };
            }
            if (lowerRef.startsWith("refs/tags/")) {
              return { ref: ref2 };
            }
            if (lowerRef.startsWith("refs/")) {
              return { ref: ref2 };
            }
            const branches = yield* use((git2) => git2.branch(["--list", "--remote", `origin/${ref2}`]));
            if (branches.all.length > 0) {
              return { ref: ref2, startPoint: `refs/remotes/origin/${ref2}` };
            }
            const tags = yield* use((git2) => git2.tags(["--list", ref2]));
            if (tags.all.length > 0) {
              return { ref: `refs/tags/${ref2}` };
            }
            return yield* new GitError2({
              cause: new SimpleGit__namespace.GitError(void 0, `Could not find matching ref for ${ref2}`)
            });
          }
        );
        yield* use(
          (git2) => git2.addConfig("user.name", userName).addConfig("user.email", userEmail)
        );
        const info = yield* getCheckoutInfo(ref);
        yield* use(
          (git2) => info.startPoint ? git2.checkoutBranch(info.ref, info.startPoint) : git2.checkout(info.ref).then(Function.constVoid)
        );
        return {
          use,
          path: directory
        };
      }
    );
    return {
      clone,
      open
    };
  })
}) {
};
var RollupError = class extends effect.Data.TaggedError("RollupError") {
};
var Rollup = class extends effect.Effect.Service()("app/Rollup", {
  effect: effect.Effect.gen(function* () {
    const onwarn = (warning, next) => {
      if (warning.code === "THIS_IS_UNDEFINED") {
        return;
      }
      next(warning);
    };
    const plugins = [
      pluginNodeResolve.nodeResolve(),
      esbuild__default.default(),
      terser__default.default({ mangle: true, compress: true })
    ];
    const bundle = effect.Effect.fn("Rollup.bundle")(
      function* (input2) {
        const bundle2 = yield* effect.Effect.tryPromise({
          try: () => Api__namespace.rollup({ input: input2, onwarn, plugins }),
          catch: (cause) => new RollupError({ cause })
        });
        const encoder = new TextEncoder();
        const chunk = yield* effect.Effect.tryPromise({
          try: () => bundle2.generate({ format: "cjs" }),
          catch: (cause) => new RollupError({ cause })
        }).pipe(effect.Effect.map(({ output }) => output[0]));
        const buffer = encoder.encode(chunk.code);
        const sizeInBytes = yield* effect.Stream.succeed(buffer).pipe(
          platformNode.NodeStream.pipeThroughSimple(() => zlib.createGzip()),
          effect.Stream.runFold(0, (size, bytes) => size + bytes.length)
        );
        yield* effect.Console.log({ ...chunk, sizeInBytes });
      }
    );
    return {
      bundle
    };
  })
}) {
};

// src/index.ts
var ConfigProviderLayer = effect.ConfigProvider.fromEnv().pipe(
  effect.ConfigProvider.constantCase,
  effect.Layer.setConfigProvider
);
var main = effect.Effect.gen(function* () {
  const eventName = yield* effect.Config.nonEmptyString("GITHUB_EVENT_NAME");
  if (eventName !== "pull_request") {
    return yield* effect.Effect.dieMessage("Package metrics can only be computed for pull requests");
  }
  const repository = yield* effect.Config.nonEmptyString("GITHUB_REPOSITORY");
  input("base_ref").pipe(
    effect.Config.orElse(() => effect.Config.nonEmptyString("GITHUB_BASE_REF"))
  );
  input("head_ref").pipe(
    effect.Config.orElse(() => effect.Config.nonEmptyString("GITHUB_HEAD_REF"))
  );
  const git = yield* Git;
  yield* git.clone(`https://github.com/${repository}.git`, "base");
  yield* git.clone(`https://github.com/${repository}.git`, "head");
});
var MainLayer = effect.Layer.mergeAll(
  Git.Default,
  Rollup.Default
).pipe(effect.Layer.provide(ConfigProviderLayer));
main.pipe(
  effect.Effect.provide(MainLayer),
  platformNode.NodeRuntime.runMain
);
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map