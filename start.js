// Start script: launches Express (port 3000) + SSL proxy (port 5000 → 3000)
const { spawn } = require("child_process");
const path = require("path");

// Start the Express server
const express = spawn("node", ["server.js"], {
  cwd: __dirname,
  stdio: "inherit",
  env: { ...process.env },
});

// Give Express a moment to bind, then start SSL proxy
setTimeout(() => {
  const proxy = spawn(
    "npx",
    ["local-ssl-proxy", "--source", "5000", "--target", "3000"],
    {
      cwd: __dirname,
      stdio: "inherit",
      env: { ...process.env },
    }
  );

  proxy.on("error", (err) => {
    console.error("SSL proxy failed to start:", err.message);
  });

  proxy.on("exit", (code) => {
    console.log(`SSL proxy exited with code ${code}`);
    express.kill();
    process.exit(code);
  });
}, 1500);

express.on("error", (err) => {
  console.error("Express server failed:", err.message);
});

express.on("exit", (code) => {
  console.log(`Express exited with code ${code}`);
  process.exit(code);
});

// Cleanup on SIGINT/SIGTERM
["SIGINT", "SIGTERM"].forEach((sig) => {
  process.on(sig, () => {
    express.kill();
    process.exit(0);
  });
});
