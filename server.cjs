// Entry point CommonJS untuk CloudLinux/LiteSpeed Node.js Selector.
// lsnode memuat startup file dengan require(), sehingga file ini tidak boleh
// memakai ESM top-level await. PORT disediakan otomatis oleh hosting.
process.env.NODE_ENV = "production";
process.env.HOSTNAME = "0.0.0.0";

require("./.next/standalone/server.js");
