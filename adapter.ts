import * as path from "path";
import * as fs from "fs";
import { build } from "esbuild";
import { spawnSync } from "child_process";
import { Adapter } from "@sveltejs/kit";

const rmRecursive = (p: string) => {
  if (!fs.existsSync(p)) return;
  const stats = fs.statSync(p);
  if (stats.isDirectory()) {
    fs.readdirSync(p).forEach((f) => {
      rmRecursive(path.join(p, f));
    });
    fs.rmdirSync(p);
  } else {
    fs.unlinkSync(p);
  }
};

export default {
  name: "adapter-aws",
  async adapt({ utils }: any): Promise<void> {
    const contentPath = path.join(__dirname, "output");
    rmRecursive(contentPath);
    const outputPath = path.join(process.cwd(), ".svelte-kit/", "output");
    const serverPath = path.join(contentPath, "server");
    const staticPath = path.join(outputPath, "static");
    utils.copy_server_files(serverPath);
    utils.copy_client_files(staticPath);
    utils.copy_static_files(staticPath);

    await build({
      entryPoints: [path.join(__dirname, "lambda", "index.js")],
      outdir: path.join(outputPath, "server-bundle"),
      bundle: true,
      platform: "node",
      inject: [path.join(__dirname, "./lambda/shims.js")],
    });

    if (
      !(
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        process.env.AWS_DEFAULT_REGION
      )
    ) {
      return;
    }

    const cdkProc = spawnSync(
      "npx",
      [
        "cdk",
        "deploy",
        "--app",
        "bin/adapter.js",
        "*-SvelteKitAdapterStack",
        "--require-approval",
        "never",
      ],
      {
        cwd: __dirname,
        env: Object.assign(
          {
            SERVER_PATH: path.join(outputPath, "server-bundle"),
            STATIC_PATH: path.join(outputPath, "static"),
            NAMESPACE: process.env.NAMESPACE || "Default",
          },
          process.env
        ),
      }
    );
    console.log(cdkProc.output.toString());
  },
} as Adapter;
