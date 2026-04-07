"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionableError = void 0;
class ActionableError extends Error {
    constructor(message) {
        super(message);
    }
}
exports.ActionableError = ActionableError;
