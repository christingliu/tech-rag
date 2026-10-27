"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./env");
var strict_1 = require("node:assert/strict");
var agent_controller_1 = require("../lib/agent-controller");
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var vectorCalls, decideCalls, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    vectorCalls = 0;
                    decideCalls = 0;
                    return [4 /*yield*/, (0, agent_controller_1.runAgent)("React 的 useState 是什么？", {
                            maxSteps: 4,
                            tools: {
                                vector_search: {
                                    execute: function (input) {
                                        return __awaiter(this, void 0, void 0, function () {
                                            return __generator(this, function (_a) {
                                                vectorCalls++;
                                                console.log("实际执行 vector_search:", input);
                                                // 模拟检索成功，但没有任何结果。
                                                return [2 /*return*/, {
                                                        ok: true,
                                                        data: [],
                                                        metadata: { resultCount: 0 },
                                                    }];
                                            });
                                        });
                                    },
                                },
                            },
                            decide: function (observation) {
                                return __awaiter(this, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        decideCalls++;
                                        console.log("\u51B3\u7B56\u8F6E\u6B21 ".concat(decideCalls, "\uFF0C\u5DF2\u6267\u884C\u6B65\u9AA4 ").concat(observation.steps));
                                        // 故意忽略重复调用提示，持续请求相同调用，
                                        // 用来验证 Controller 能否在工具执行前拦截。
                                        return [2 /*return*/, {
                                                done: false,
                                                reason: "测试：故意重复调用",
                                                action: {
                                                    tool: "vector_search",
                                                    input: {
                                                        query: "React 的 useState 是什么？",
                                                        limit: 5,
                                                    },
                                                    reason: "测试重复调用保护",
                                                },
                                            }];
                                    });
                                });
                            },
                        })];
                case 1:
                    result = _a.sent();
                    console.log("\n测试结果：", {
                        status: result.status,
                        stopReason: result.stopReason,
                        vectorCalls: vectorCalls,
                        decideCalls: decideCalls,
                        traceLength: result.trace.length,
                    });
                    // 核心断言：工具只能实际执行一次。
                    strict_1.default.equal(vectorCalls, 1, "失败：相同工具和参数被重复执行了");
                    // 只应有首次真实工具调用的执行轨迹。
                    strict_1.default.equal(result.trace.length, 1, "失败：重复调用被写入了实际执行轨迹");
                    // 按当前重复调用保护的设计，第二次重复拦截后终止。
                    strict_1.default.equal(result.stopReason, "REPEATED_TOOL_CALL_BLOCKED", "失败：Agent 未按预期因重复调用而终止");
                    console.log("\nV9.5 相同工具、相同参数重复调用保护测试通过");
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(function (error) {
    console.error("重复调用保护测试失败：", error);
    process.exitCode = 1;
});
