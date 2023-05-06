"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokerSocketServer = void 0;
/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 04/05/2023
 **  @Description
 ***********************************************************/
const socket_io_1 = __importDefault(require("socket.io"));
const MemoryDatabase = [];
class BrokerSocketServer {
    constructor(port = 3000) {
        this.socket = new socket_io_1.default.Server().listen(port);
        this.socket.on('connection', (socket) => {
            console.debug('new service connected... waiting for authentication');
            socket.emit('identification', socket.id);
            socket.on('sign', this.sign);
            socket.on('disconnect', this.unsigned);
        });
    }
    get getStreamNames() {
        return MemoryDatabase.map((e) => e.streamName);
    }
    sign(data) {
        if (MemoryDatabase) {
            const index = MemoryDatabase.findIndex((x) => {
                return x.streamName === data.streamName;
            });
            if (index > -1)
                MemoryDatabase[index] = data;
            else
                MemoryDatabase.push(data);
        }
    }
    unsigned(data) {
        const index = MemoryDatabase.findIndex((x) => {
            return x.id === data.id;
        });
        if (index > -1)
            MemoryDatabase.splice(index, 1);
    }
}
exports.BrokerSocketServer = BrokerSocketServer;
