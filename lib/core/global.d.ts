/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 11/02/2022
 **  @Description
 ***********************************************************/
import { BACKWARDS, END, EventData, EventStoreDBClient, jsonEvent, JSONType, PersistentSubscriptionBase, persistentSubscriptionSettingsFromDefaults, START, StreamSubscription } from "@eventstore/db-client";
import md5 from "md5";
import EventCollection, { IEventCollection } from "./mongo-plugin";
import { PersistentSubscription } from "@eventstore/db-client/dist/types";
import bigInt from "big-integer";
import { EventEmitter } from 'events';
declare enum EMethodList {
    create = 0,
    update = 1,
    delete = 2,
    recover = 3,
    worker = 4,
    init = 5
}
declare type MethodList = keyof typeof EMethodList;
declare type Method = MethodList[];
declare type IStartRevisionValues = bigint | 'start' | 'end';
declare type EventType = keyof typeof EMethodList;
declare type IEventHandlerGroup = 'dispatch' | 'consumers';
declare type IDataLinkEvent = [string, any];
declare type IStream = {
    [V in MethodList]?: StreamSubscription;
};
declare type IQueue = {
    [V in MethodList]?: StreamSubscription[];
};
declare type IQueueCustom = {
    [V in MethodList]?: {
        [key: string]: StreamSubscription[];
    };
} & IQueue;
interface ITemplateEvent {
    $correlationId?: string;
    state?: 'processing' | 'completed' | 'stalled' | 'delivered' | 'error' | 'system' | 'trigger';
    [key: string]: any;
}
interface IEvenStoreConfig {
    connexion: {
        endpoint: string;
        [key: string]: any;
    };
    security: {
        insecure: boolean;
        [key: string]: any;
    };
    credentials: {
        username: string;
        password: string;
    };
}
interface IReadStreamConfig {
    direction: "backwards" | "forwards";
    fromRevision: "start" | "end";
    maxCount: number;
    credentials: IEvenStoreConfig["credentials"];
}
interface IAvailableEvent extends IEventCollection {
}
interface IStartRevision {
    [key: string]: IStartRevisionValues;
}
interface IListStreamSubscription {
    [key: string]: PersistentSubscription;
}
interface ITriggerList {
    causationId: string;
    trigger: string[];
}
export { ITriggerList, EventEmitter, bigInt, PersistentSubscription, EventCollection, persistentSubscriptionSettingsFromDefaults, PersistentSubscriptionBase, jsonEvent, EventStoreDBClient, END, START, IDataLinkEvent, IEventHandlerGroup, IListStreamSubscription, IStartRevision, StreamSubscription, IAvailableEvent, IReadStreamConfig, IEvenStoreConfig, IQueue, IQueueCustom, IStream, ITemplateEvent, EventType, IStartRevisionValues, Method, MethodList, EMethodList, JSONType, BACKWARDS, EventData, md5 };