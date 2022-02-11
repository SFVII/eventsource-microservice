"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_long_1 = __importDefault(require("mongoose-long"));
const MongoosePlugin = (mongoose) => {
    (0, mongoose_long_1.default)(mongoose);
    /***********************************************************
     **  @project
     **  @file
     **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
     **  @Date 09/02/2022
     **  @Description
     ***********************************************************/
    const EventCollection = mongoose.model('events-checkpoint', new mongoose.Schema({
        StreamName: String,
        Revision: mongoose.Schema.Types.Long,
        Service: Boolean,
        Active: Boolean,
        IsCreatedPersistent: Boolean,
        CreatedDate: mongoose.Schema.Types.Date,
        UpdatedDate: mongoose.Schema.Types.Date
    }));
    EventCollection.collection.createIndex({
        StreamName: 1
    });
    return EventCollection;
};
exports.default = MongoosePlugin;
