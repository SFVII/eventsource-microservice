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
class BrokerSocketServer {
    constructor(port = 3000) {
        this.db = [];
        this.socket = new socket_io_1.default.Server().listen(port);
        this.socket.on('connection', (socket) => {
            console.log('new service connected... waiting for authentication');
            socket.emit('identification', socket.id);
            socket.on('sign', this.sign);
            socket.on('disconnect', this.unsigned);
        });
    }
    get getStreamNames() {
        return this.db.map((e) => e.streamName);
    }
    sign(data) {
        const index = this.db.findIndex((x) => { if (x.streamName === data.streamName)
            return x; });
        if (index > -1)
            this.db[index] = data;
        else
            this.db.push(data);
    }
    unsigned(data) {
        const index = this.db.findIndex((x) => { if (x.id === data.id)
            return x; });
        if (index > -1)
            this.db.splice(index, 1);
    }
}
exports.BrokerSocketServer = BrokerSocketServer;
