"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var dotenv_1 = require("dotenv");
var undici_1 = require("undici");
dotenv_1.default.config({ path: ".env.local" });
var proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxy) {
    (0, undici_1.setGlobalDispatcher)(new undici_1.ProxyAgent(proxy));
}
