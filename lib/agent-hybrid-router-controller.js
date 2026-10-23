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
exports.runAgent = runAgent;
function runAgent(question, options) {
    return __awaiter(this, void 0, void 0, function () {
        var maxSteps, evidence, trace, lastTool, lastToolResult, routing, initialAction, directAnswerRoute, routeResult, _a, decision, _b, step, observation, decision, _c, action, tool, startedAt, result, durationMs, _d;
        var _e, _f, _g, _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0:
                    maxSteps = (_e = options.maxSteps) !== null && _e !== void 0 ? _e : 4;
                    if (!question.trim()) {
                        return [2 /*return*/, {
                                status: "failed",
                                evidence: [],
                                trace: [],
                                stopReason: "EMPTY_QUESTION",
                            }];
                    }
                    if (!Number.isInteger(maxSteps) ||
                        maxSteps < 1 ||
                        maxSteps > 10) {
                        throw new Error("maxSteps 必须是 1～10 的整数");
                    }
                    evidence = [];
                    trace = [];
                    directAnswerRoute = false;
                    if (!options.initialRouter) return [3 /*break*/, 5];
                    routeResult = void 0;
                    _k.label = 1;
                case 1:
                    _k.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, options.initialRouter(question)];
                case 2:
                    routeResult = _k.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _k.sent();
                    // Router 本身异常时，尝试使用已注册的向量检索降级。
                    if (!options.tools.vector_search) {
                        return [2 /*return*/, {
                                status: "failed",
                                evidence: evidence,
                                trace: trace,
                                stopReason: "ROUTER_FAILED_NO_FALLBACK_TOOL",
                            }];
                    }
                    routeResult = {
                        route: {
                            type: "tool",
                            tool: "vector_search",
                            reason: "ROUTER_EXECUTION_FAILED",
                        },
                        source: "fallback",
                        fallbackReason: "ROUTER_EXECUTION_FAILED",
                    };
                    return [3 /*break*/, 4];
                case 4:
                    routing = {
                        initialRoute: routeResult.route,
                        routerSource: routeResult.source,
                        fallbackReason: routeResult.fallbackReason,
                    };
                    if (routeResult.route.type === "tool") {
                        initialAction = {
                            tool: routeResult.route.tool,
                            input: { query: question },
                            reason: routeResult.route.reason,
                        };
                    }
                    else {
                        directAnswerRoute = true;
                    }
                    _k.label = 5;
                case 5:
                    if (!directAnswerRoute) return [3 /*break*/, 10];
                    decision = void 0;
                    _k.label = 6;
                case 6:
                    _k.trys.push([6, 8, , 9]);
                    return [4 /*yield*/, options.decide({
                            question: question,
                            steps: 0,
                            evidence: evidence,
                            lastTool: lastTool,
                            lastToolResult: lastToolResult,
                            routing: routing,
                        })];
                case 7:
                    decision = _k.sent();
                    return [3 /*break*/, 9];
                case 8:
                    _b = _k.sent();
                    return [2 /*return*/, {
                            status: "failed",
                            evidence: evidence,
                            trace: trace,
                            stopReason: "DECISION_FAILED",
                            routing: routing,
                        }];
                case 9:
                    if (!decision.done) {
                        return [2 /*return*/, {
                                status: "failed",
                                evidence: evidence,
                                trace: trace,
                                stopReason: "DIRECT_ANSWER_NOT_FINAL",
                                routing: routing,
                            }];
                    }
                    if (!((_f = decision.answer) === null || _f === void 0 ? void 0 : _f.trim())) {
                        return [2 /*return*/, {
                                status: "failed",
                                evidence: evidence,
                                trace: trace,
                                stopReason: "EMPTY_FINAL_ANSWER",
                                routing: routing,
                            }];
                    }
                    return [2 /*return*/, {
                            status: "completed",
                            answer: decision.answer,
                            evidence: evidence,
                            trace: trace,
                            stopReason: decision.reason,
                            routing: routing,
                        }];
                case 10:
                    step = 1;
                    _k.label = 11;
                case 11:
                    if (!(step <= maxSteps)) return [3 /*break*/, 20];
                    observation = {
                        question: question,
                        steps: step - 1,
                        evidence: evidence,
                        lastTool: lastTool,
                        lastToolResult: lastToolResult,
                        routing: routing,
                    };
                    decision = void 0;
                    if (!(step === 1 && initialAction)) return [3 /*break*/, 12];
                    decision = {
                        action: initialAction,
                        done: false,
                        reason: "INITIAL_ROUTE",
                    };
                    return [3 /*break*/, 15];
                case 12:
                    _k.trys.push([12, 14, , 15]);
                    return [4 /*yield*/, options.decide(observation)];
                case 13:
                    decision = _k.sent();
                    return [3 /*break*/, 15];
                case 14:
                    _c = _k.sent();
                    return [2 /*return*/, {
                            status: "failed",
                            evidence: evidence,
                            trace: trace,
                            stopReason: "DECISION_FAILED",
                            routing: routing,
                        }];
                case 15:
                    if (decision.done) {
                        if (!((_g = decision.answer) === null || _g === void 0 ? void 0 : _g.trim())) {
                            return [2 /*return*/, {
                                    status: "failed",
                                    evidence: evidence,
                                    trace: trace,
                                    stopReason: "EMPTY_FINAL_ANSWER",
                                    routing: routing,
                                }];
                        }
                        return [2 /*return*/, {
                                status: "completed",
                                answer: decision.answer,
                                evidence: evidence,
                                trace: trace,
                                stopReason: decision.reason,
                                routing: routing,
                            }];
                    }
                    if (!decision.action) {
                        return [2 /*return*/, {
                                status: "failed",
                                evidence: evidence,
                                trace: trace,
                                stopReason: "MISSING_ACTION",
                                routing: routing,
                            }];
                    }
                    action = decision.action;
                    tool = options.tools[action.tool];
                    if (!tool) {
                        return [2 /*return*/, {
                                status: "failed",
                                evidence: evidence,
                                trace: trace,
                                stopReason: "TOOL_NOT_ALLOWED",
                                routing: routing,
                            }];
                    }
                    startedAt = Date.now();
                    _k.label = 16;
                case 16:
                    _k.trys.push([16, 18, , 19]);
                    return [4 /*yield*/, tool.execute(action.input)];
                case 17:
                    result = _k.sent();
                    durationMs = Date.now() - startedAt;
                    trace.push({
                        step: step,
                        action: action,
                        success: result.ok,
                        resultCount: (_h = result.metadata) === null || _h === void 0 ? void 0 : _h.resultCount,
                        errorCode: (_j = result.error) === null || _j === void 0 ? void 0 : _j.code,
                        durationMs: durationMs,
                    });
                    lastTool = action.tool;
                    lastToolResult = result;
                    if (result.ok && result.data !== undefined) {
                        evidence.push(result.data);
                    }
                    return [3 /*break*/, 19];
                case 18:
                    _d = _k.sent();
                    trace.push({
                        step: step,
                        action: action,
                        success: false,
                        errorCode: "TOOL_EXECUTION_FAILED",
                        durationMs: Date.now() - startedAt,
                    });
                    lastTool = action.tool;
                    lastToolResult = {
                        ok: false,
                        error: {
                            code: "TOOL_EXECUTION_FAILED",
                        },
                    };
                    return [3 /*break*/, 19];
                case 19:
                    step++;
                    return [3 /*break*/, 11];
                case 20: return [2 /*return*/, {
                        status: "max_steps",
                        evidence: evidence,
                        trace: trace,
                        stopReason: "MAX_STEPS_REACHED",
                        routing: routing,
                    }];
            }
        });
    });
}
