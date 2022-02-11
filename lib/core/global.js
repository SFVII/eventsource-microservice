"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.md5 = exports.BACKWARDS = exports.EMethodList = exports.END = exports.EventStoreDBClient = exports.jsonEvent = exports.persistentSubscriptionSettingsFromDefaults = exports.EventCollection = exports.bigInt = exports.EventEmitter = void 0;
/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 11/02/2022
 **  @Description
 ***********************************************************/
const db_client_1 = require("@eventstore/db-client");
Object.defineProperty(exports, "BACKWARDS", { enumerable: true, get: function () { return db_client_1.BACKWARDS; } });
Object.defineProperty(exports, "END", { enumerable: true, get: function () { return db_client_1.END; } });
Object.defineProperty(exports, "EventStoreDBClient", { enumerable: true, get: function () { return db_client_1.EventStoreDBClient; } });
Object.defineProperty(exports, "jsonEvent", { enumerable: true, get: function () { return db_client_1.jsonEvent; } });
Object.defineProperty(exports, "persistentSubscriptionSettingsFromDefaults", { enumerable: true, get: function () { return db_client_1.persistentSubscriptionSettingsFromDefaults; } });
const md5_1 = __importDefault(require("md5"));
exports.md5 = md5_1.default;
const mongo_plugin_1 = __importDefault(require("./mongo-plugin"));
exports.EventCollection = mongo_plugin_1.default;
const big_integer_1 = __importDefault(require("big-integer"));
exports.bigInt = big_integer_1.default;
const events_1 = require("events");
Object.defineProperty(exports, "EventEmitter", { enumerable: true, get: function () { return events_1.EventEmitter; } });
var EMethodList;
(function (EMethodList) {
    EMethodList[EMethodList["create"] = 0] = "create";
    EMethodList[EMethodList["update"] = 1] = "update";
    EMethodList[EMethodList["delete"] = 2] = "delete";
    EMethodList[EMethodList["init"] = 3] = "init";
})(EMethodList || (EMethodList = {}));
exports.EMethodList = EMethodList;
