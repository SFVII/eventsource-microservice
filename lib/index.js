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
exports.EventsPlugin = exports.EventConsumer = exports.EventHandler = void 0;
const handler_1 = __importDefault(require("./handler"));
exports.EventHandler = handler_1.default;
const consumer_1 = __importDefault(require("./consumer"));
exports.EventConsumer = consumer_1.default;
const client_1 = __importDefault(require("./client"));
exports.EventsPlugin = client_1.default;
const Instance = (type) => {
    switch (type) {
        case 'handler':
            return handler_1.default;
        case 'consumer':
            return consumer_1.default;
        case 'client':
            return client_1.default;
    }
};
exports.default = Instance;
