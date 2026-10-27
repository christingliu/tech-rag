"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDecisionNode = createDecisionNode;
exports.createToolExecutionNode = createToolExecutionNode;
exports.runAgent = runAgent;
exports.applyAgentStateUpdate = applyAgentStateUpdate;
exports.routeDecision = routeDecision;
exports.finalizeAgentState = finalizeAgentState;
var node_crypto_1 = require("node:crypto");
function createDecisionNode(decide) {
    return {
        execute: function (_a) {
            return __awaiter(this, arguments, void 0, function (_b) {
                var observation, decision;
                var state = _b.state;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            observation = {
                                question: state.question,
                                steps: state.currentStep,
                                evidence: __spreadArray([], state.evidence, true),
                                messages: __spreadArray([], state.messages, true),
                                lastTool: state.lastTool,
                                lastToolResult: state.lastToolResult,
                            };
                            return [4 /*yield*/, decide(observation)];
                        case 1:
                            decision = _c.sent();
                            return [2 /*return*/, {
                                    decision: decision,
                                    update: {
                                        messagesToAppend: [
                                            {
                                                role: "assistant",
                                                content: JSON.stringify({
                                                    event: "decision",
                                                    step: state.currentStep + 1,
                                                    reason: decision.reason,
                                                    done: decision.done,
                                                    action: decision.action,
                                                    answer: decision.answer,
                                                }),
                                            },
                                        ],
                                    },
                                }];
                    }
                });
            });
        },
    };
}
function createToolExecutionNode(tools) {
    return {
        execute: function (_a) {
            return __awaiter(this, arguments, void 0, function (_b) {
                var tool, startedAt, callMessage, result, durationMs, error_1, durationMs, failedResult;
                var _c, _d;
                var state = _b.state, action = _b.action, toolCallId = _b.toolCallId;
                return __generator(this, function (_e) {
                    switch (_e.label) {
                        case 0:
                            tool = tools[action.tool];
                            if (!tool) {
                                throw new Error("TOOL_NOT_REGISTERED: ".concat(action.tool));
                            }
                            startedAt = Date.now();
                            callMessage = {
                                role: "assistant",
                                toolName: action.tool,
                                toolCallId: toolCallId,
                                content: JSON.stringify({
                                    event: "tool_call",
                                    step: state.currentStep + 1,
                                    tool: action.tool,
                                    input: action.input,
                                    reason: action.reason,
                                }),
                            };
                            _e.label = 1;
                        case 1:
                            _e.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, tool.execute(action.input)];
                        case 2:
                            result = _e.sent();
                            durationMs = Date.now() - startedAt;
                            return [2 /*return*/, {
                                    update: {
                                        currentStep: state.currentStep + 1,
                                        lastTool: action.tool,
                                        lastToolResult: result,
                                        traceToAppend: [
                                            {
                                                step: state.currentStep + 1,
                                                action: action,
                                                success: result.ok,
                                                resultCount: (_c = result.metadata) === null || _c === void 0 ? void 0 : _c.resultCount,
                                                errorCode: (_d = result.error) === null || _d === void 0 ? void 0 : _d.code,
                                                durationMs: durationMs,
                                            },
                                        ],
                                        evidenceToAppend: result.ok &&
                                            result.data !== undefined &&
                                            result.data !== null &&
                                            (!Array.isArray(result.data) ||
                                                result.data.length > 0)
                                            ? [result.data]
                                            : [],
                                        messagesToAppend: [
                                            callMessage,
                                            {
                                                role: "tool",
                                                toolName: action.tool,
                                                toolCallId: toolCallId,
                                                content: JSON.stringify({
                                                    ok: result.ok,
                                                    data: result.data,
                                                    metadata: result.metadata,
                                                    error: result.error,
                                                }),
                                            },
                                        ],
                                    },
                                }];
                        case 3:
                            error_1 = _e.sent();
                            durationMs = Date.now() - startedAt;
                            failedResult = {
                                ok: false,
                                error: {
                                    code: "TOOL_EXECUTION_FAILED",
                                    message: error_1 instanceof Error
                                        ? error_1.message
                                        : String(error_1),
                                },
                            };
                            return [2 /*return*/, {
                                    update: {
                                        currentStep: state.currentStep + 1,
                                        lastTool: action.tool,
                                        lastToolResult: failedResult,
                                        traceToAppend: [
                                            {
                                                step: state.currentStep + 1,
                                                action: action,
                                                success: false,
                                                errorCode: "TOOL_EXECUTION_FAILED",
                                                durationMs: durationMs,
                                            },
                                        ],
                                        messagesToAppend: [
                                            callMessage,
                                            {
                                                role: "tool",
                                                toolName: action.tool,
                                                toolCallId: toolCallId,
                                                content: JSON.stringify(failedResult),
                                            },
                                        ],
                                    },
                                }];
                        case 4: return [2 /*return*/];
                    }
                });
            });
        },
    };
}
function stableSerialize(value) {
    var _a;
    if (Array.isArray(value)) {
        return "[".concat(value.map(stableSerialize).join(","), "]");
    }
    if (value !== null && typeof value === "object") {
        var entries = Object.entries(value).sort(function (_a, _b) {
            var a = _a[0];
            var b = _b[0];
            return a.localeCompare(b);
        });
        return "{".concat(entries
            .map(function (_a) {
            var key = _a[0], item = _a[1];
            return "".concat(JSON.stringify(key), ":").concat(stableSerialize(item));
        })
            .join(","), "}");
    }
    return (_a = JSON.stringify(value)) !== null && _a !== void 0 ? _a : String(value);
}
function createToolCallSignature(action) {
    return "".concat(action.tool, ":").concat(stableSerialize(action.input));
}
function isEmptyOrFailedToolResult(result) {
    var _a;
    if (result === null || typeof result !== "object") {
        return true;
    }
    var value = result;
    if (value.ok !== true) {
        return true;
    }
    if (value.data === null ||
        value.data === undefined ||
        (Array.isArray(value.data) && value.data.length === 0) ||
        (typeof value.data === "string" && !value.data.trim())) {
        return true;
    }
    if (typeof ((_a = value.metadata) === null || _a === void 0 ? void 0 : _a.resultCount) === "number" &&
        value.metadata.resultCount <= 0) {
        return true;
    }
    return (typeof value.data === "object" &&
        !Array.isArray(value.data) &&
        Object.keys(value.data).length === 0);
}
function runAgent(question, options) {
    return __awaiter(this, void 0, void 0, function () {
        var maxSteps, state, decisionNode, toolExecutionNode, emptyToolCallSignatures, blockedDuplicateSignatures, toResult, step, decisionOutput, error_2, decision, route, signature, repeatedTwice, toolCallId, toolOutput, error_3;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    maxSteps = (_a = options.maxSteps) !== null && _a !== void 0 ? _a : 4;
                    if (!question.trim()) {
                        return [2 /*return*/, {
                                status: "failed",
                                evidence: [],
                                trace: [],
                                messages: [],
                                stopReason: "EMPTY_QUESTION",
                            }];
                    }
                    if (!Number.isInteger(maxSteps) ||
                        maxSteps < 1 ||
                        maxSteps > 10) {
                        throw new Error("maxSteps 必须是 1～10 的整数");
                    }
                    state = {
                        runId: (0, node_crypto_1.randomUUID)(),
                        question: question,
                        status: "running",
                        currentStep: 0,
                        maxSteps: maxSteps,
                        evidence: [],
                        messages: [{ role: "user", content: question }],
                        trace: [],
                    };
                    decisionNode = createDecisionNode(options.decide);
                    toolExecutionNode = createToolExecutionNode(options.tools);
                    emptyToolCallSignatures = new Set();
                    blockedDuplicateSignatures = new Set();
                    toResult = function () {
                        var _a;
                        return ({
                            status: state.status,
                            answer: state.answer,
                            evidence: state.evidence,
                            trace: state.trace,
                            messages: state.messages,
                            stopReason: (_a = state.stopReason) !== null && _a !== void 0 ? _a : "UNKNOWN",
                        });
                    };
                    step = 1;
                    _b.label = 1;
                case 1:
                    if (!(step <= state.maxSteps)) return [3 /*break*/, 10];
                    decisionOutput = void 0;
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, decisionNode.execute({ state: state })];
                case 3:
                    decisionOutput = _b.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_2 = _b.sent();
                    state = finalizeAgentState(state, "failed", "DECISION_FAILED");
                    state = applyAgentStateUpdate(state, {
                        messagesToAppend: [
                            {
                                role: "system",
                                content: JSON.stringify({
                                    event: "decision_failed",
                                    step: step,
                                    error: error_2 instanceof Error
                                        ? error_2.message
                                        : String(error_2),
                                }),
                            },
                        ],
                    });
                    return [2 /*return*/, toResult()];
                case 5:
                    console.log(decisionOutput, 'decisionOutput');
                    // 先应用决策节点更新，保证后续节点看到最新消息历史。
                    state = applyAgentStateUpdate(state, decisionOutput.update);
                    decision = decisionOutput.decision;
                    route = routeDecision(state, decision, options.tools);
                    if (route.type === "finalize") {
                        state = finalizeAgentState(state, route.status, route.stopReason, route.answer);
                        return [2 /*return*/, toResult()];
                    }
                    signature = createToolCallSignature(route.action);
                    if (emptyToolCallSignatures.has(signature)) {
                        repeatedTwice = blockedDuplicateSignatures.has(signature);
                        state = applyAgentStateUpdate(state, {
                            messagesToAppend: [
                                {
                                    role: "system",
                                    content: JSON.stringify({
                                        event: "duplicate_empty_tool_call_blocked",
                                        step: step,
                                        tool: route.action.tool,
                                        input: route.action.input,
                                        instruction: repeatedTwice
                                            ? "Repeated blocked call detected. Stop searching and return an insufficient-evidence result if no alternative remains."
                                            : "This exact tool call previously returned no useful result or failed. Choose a different tool, meaningfully change the input, or stop.",
                                    }),
                                },
                            ],
                        });
                        if (repeatedTwice) {
                            state = finalizeAgentState(state, "failed", "REPEATED_TOOL_CALL_BLOCKED");
                            return [2 /*return*/, toResult()];
                        }
                        blockedDuplicateSignatures.add(signature);
                        return [3 /*break*/, 9];
                    }
                    toolCallId = (0, node_crypto_1.randomUUID)();
                    _b.label = 6;
                case 6:
                    _b.trys.push([6, 8, , 9]);
                    return [4 /*yield*/, toolExecutionNode.execute({
                            state: state,
                            action: route.action,
                            toolCallId: toolCallId,
                        })];
                case 7:
                    toolOutput = _b.sent();
                    console.log(toolOutput, 'toolOutput');
                    state = applyAgentStateUpdate(state, toolOutput.update);
                    if (isEmptyOrFailedToolResult(state.lastToolResult)) {
                        emptyToolCallSignatures.add(signature);
                    }
                    return [3 /*break*/, 9];
                case 8:
                    error_3 = _b.sent();
                    state = applyAgentStateUpdate(state, {
                        status: "failed",
                        stopReason: "TOOL_NODE_FAILED",
                        messagesToAppend: [
                            {
                                role: "system",
                                content: JSON.stringify({
                                    event: "tool_node_failed",
                                    step: step,
                                    error: error_3 instanceof Error
                                        ? error_3.message
                                        : String(error_3),
                                }),
                            },
                        ],
                    });
                    return [2 /*return*/, toResult()];
                case 9:
                    step++;
                    return [3 /*break*/, 1];
                case 10:
                    // 所有步数用完仍未得到最终答案
                    state = finalizeAgentState(state, "max_steps", "MAX_STEPS_REACHED");
                    return [2 /*return*/, toResult()];
            }
        });
    });
}
function applyAgentStateUpdate(state, update) {
    var _a = update.evidenceToAppend, evidenceToAppend = _a === void 0 ? [] : _a, _b = update.messagesToAppend, messagesToAppend = _b === void 0 ? [] : _b, _c = update.traceToAppend, traceToAppend = _c === void 0 ? [] : _c, fields = __rest(update, ["evidenceToAppend", "messagesToAppend", "traceToAppend"]);
    return __assign(__assign(__assign({}, state), fields), { evidence: __spreadArray(__spreadArray([], state.evidence, true), evidenceToAppend, true), messages: __spreadArray(__spreadArray([], state.messages, true), messagesToAppend, true), trace: __spreadArray(__spreadArray([], state.trace, true), traceToAppend, true) });
}
function routeDecision(state, decision, tools) {
    var _a;
    if (decision.done) {
        var hasEvidence = state.evidence.some(function (item) {
            if (item === null || item === undefined) {
                return false;
            }
            return !Array.isArray(item) || item.length > 0;
        });
        if (!hasEvidence) {
            return {
                type: "finalize",
                status: "failed",
                stopReason: "NO_EVIDENCE_FOUND",
            };
        }
        if (!((_a = decision.answer) === null || _a === void 0 ? void 0 : _a.trim())) {
            return {
                type: "finalize",
                status: "failed",
                stopReason: "EMPTY_FINAL_ANSWER",
            };
        }
        return {
            type: "finalize",
            status: "completed",
            stopReason: "LLM_FINAL_ANSWER",
            answer: decision.answer,
        };
    }
    if (!decision.action) {
        return {
            type: "finalize",
            status: "failed",
            stopReason: "MISSING_ACTION",
        };
    }
    if (!tools[decision.action.tool]) {
        return {
            type: "finalize",
            status: "failed",
            stopReason: "TOOL_NOT_REGISTERED",
        };
    }
    return {
        type: "execute_tool",
        action: decision.action,
    };
}
function finalizeAgentState(state, status, stopReason, answer) {
    return applyAgentStateUpdate(state, __assign({ status: status, stopReason: stopReason, answer: answer }, (status === "completed" && answer
        ? {
            messagesToAppend: [
                {
                    role: "assistant",
                    content: answer,
                },
            ],
        }
        : {})));
}
