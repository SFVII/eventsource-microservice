"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokerSocketClient = void 0;
/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 04/05/2023
 **  @Description
 ***********************************************************/
const socket_io_client_1 = require("socket.io-client");
class BrokerSocketClient {
    constructor(socketUrl, port = 3000) {
        this.io = (0, socket_io_client_1.io)(socketUrl, {
            reconnectionDelayMax: 10000,
            port: port
        });
    }
    set Id(data) {
        this.id = data;
    }
    get Id() {
        return this.id;
    }
    sign(socketId, streamName) {
        this.io.emit('sign', { id: socketId, streamName });
    }
    unsigned(socketId) {
        this.io.emit('unsigned', { id: socketId });
    }
    on(env, data) {
        this.io.on(env, data);
    }
}
exports.BrokerSocketClient = BrokerSocketClient;
