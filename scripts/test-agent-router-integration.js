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
var strict_1 = require("node:assert/strict");
var agent_hybrid_router_controller_1 = require("../lib/agent-hybrid-router-controller");
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var calls, result;
        var _this = this;
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0:
                    calls = [];
                    return [4 /*yield*/, (0, agent_hybrid_router_controller_1.runAgent)("React 的 useState 和 useEffect 分别解决什么问题？", {
                            maxSteps: 4,
                            initialRouter: function () { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    return [2 /*return*/, ({
                                            route: {
                                                type: "tool",
                                                tool: "vector_search",
                                                reason: "DEFAULT_SEMANTIC_SEARCH",
                                            },
                                            source: "rule",
                                        })];
                                });
                            }); },
                            tools: {
                                vector_search: {
                                    execute: function () {
                                        return __awaiter(this, void 0, void 0, function () {
                                            return __generator(this, function (_a) {
                                                calls.push("vector_search");
                                                return [2 /*return*/, {
                                                        ok: true,
                                                        data: [],
                                                        metadata: { resultCount: 0 },
                                                    }];
                                            });
                                        });
                                    },
                                },
                                keyword_search: {
                                    execute: function () {
                                        return __awaiter(this, void 0, void 0, function () {
                                            return __generator(this, function (_a) {
                                                calls.push("keyword_search");
                                                return [2 /*return*/, {
                                                        ok: true,
                                                        data: [
                                                            {
                                                                source: "react/hooks.md",
                                                                content: "useState 管理组件状态；useEffect 处理副作用。",
                                                            },
                                                        ],
                                                        metadata: { resultCount: 1 },
                                                    }];
                                            });
                                        });
                                    },
                                },
                            },
                            decide: function (observation) { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    // 首轮由 Router 指定 vector_search。
                                    // 检索无结果后，Controller 才能进入这里重新决策。
                                    if (observation.lastTool === "vector_search" &&
                                        observation.evidence.length > 0) {
                                        return [2 /*return*/, {
                                                action: {
                                                    tool: "keyword_search",
                                                    input: { query: observation.question },
                                                    reason: "RETRY_AFTER_EMPTY_VECTOR_SEARCH",
                                                },
                                                done: false,
                                                reason: "REPLAN",
                                            }];
                                    }
                                    if (observation.lastTool === "keyword_search" &&
                                        observation.evidence.length > 0) {
                                        return [2 /*return*/, {
                                                done: true,
                                                answer: "useState 用于管理组件状态；useEffect 用于处理副作用。",
                                                reason: "EVIDENCE_FOUND",
                                            }];
                                    }
                                    return [2 /*return*/, {
                                            done: true,
                                            answer: "目前没有足够证据回答。",
                                            reason: "NO_EVIDENCE",
                                        }];
                                });
                            }); },
                        })];
                case 1:
                    result = _j.sent();
                    strict_1.default.equal(result.status, "completed");
                    strict_1.default.equal((_b = (_a = result.routing) === null || _a === void 0 ? void 0 : _a.initialRoute) === null || _b === void 0 ? void 0 : _b.type, "tool");
                    if (((_d = (_c = result.routing) === null || _c === void 0 ? void 0 : _c.initialRoute) === null || _d === void 0 ? void 0 : _d.type) !== "tool") {
                        throw new Error("初始路由不是工具路由");
                    }
                    strict_1.default.equal(result.routing.initialRoute.tool, "vector_search");
                    strict_1.default.equal(result.routing.routerSource, "rule");
                    strict_1.default.deepEqual(calls, [
                        "vector_search",
                        "keyword_search",
                    ]);
                    strict_1.default.deepEqual(result.trace.map(function (item) { return item.action.tool; }), ["vector_search", "keyword_search"]);
                    strict_1.default.match((_e = result.answer) !== null && _e !== void 0 ? _e : "", /useState/);
                    strict_1.default.match((_f = result.answer) !== null && _f !== void 0 ? _f : "", /useEffect/);
                    console.log("V9.3.4 Router + Controller 集成测试通过");
                    console.log({
                        status: result.status,
                        initialRoute: (_g = result.routing) === null || _g === void 0 ? void 0 : _g.initialRoute,
                        routerSource: (_h = result.routing) === null || _h === void 0 ? void 0 : _h.routerSource,
                        calls: calls,
                        trace: result.trace.map(function (item) { return ({
                            step: item.step,
                            tool: item.action.tool,
                            success: item.success,
                            resultCount: item.resultCount,
                        }); }),
                        answer: result.answer,
                    });
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
