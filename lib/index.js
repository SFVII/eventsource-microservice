"use strict";
/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 11/02/2022
 **  @Description
 ***********************************************************/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const handler_1 = __importDefault(require("./handler"));
const consumer_1 = __importDefault(require("./consumer"));
const client_1 = __importDefault(require("./client"));
class _EventsPlugin {
}
class _EventConsumer {
}
class _EventHandler {
}
const Instance = (type, mongoose) => {
    switch (type) {
        case 'handler':
            // @ts-ignore
            return handler_1.default;
        case 'consumer':
            return (0, consumer_1.default)(mongoose);
        case 'client':
            return (0, client_1.default)(mongoose);
    }
};
exports.default = Instance;
