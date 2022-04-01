/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 11/02/2022
 **  @Description
 ***********************************************************/
import {
    BACKWARDS,
    END,
    EventData,
    EventStoreDBClient,
    jsonEvent,
    JSONType,
    PersistentSubscriptionBase,
    persistentSubscriptionSettingsFromDefaults,
    StreamSubscription
} from "@eventstore/db-client";
import md5 from "md5";
import EventCollection, {IEventCollection} from "./mongo-plugin";
import {PersistentSubscription} from "@eventstore/db-client/dist/types";
import bigInt from "big-integer";
import {EventEmitter} from 'events';


enum EMethodList {
    create,
    update,
    delete,
    init
}

type MethodList = keyof typeof EMethodList;
type Method = MethodList[];
type IStartRevisionValues = bigint | 'start' | 'end'
type EventType = keyof typeof EMethodList;
type IEventHandlerGroup = 'dispatch' | 'consumers';
type IDataLinkEvent = [string, any];
type IStream = {
    [V in MethodList]?: StreamSubscription
};
type IQueue = {
    [V in MethodList]?: StreamSubscription[];
}

type IQueueCustom = {
    [V in MethodList]?: { [key: string]: StreamSubscription[] }
}

interface ITemplateEvent {
    $correlationId?: string;
    state?: 'processing' | 'completed' | 'stalled' | 'delivered' | 'error'

    [key: string]: any;
}

interface IEvenStoreConfig {
    connexion: {
        endpoint: string
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
    credentials: IEvenStoreConfig["credentials"]
}

interface IAvailableEvent extends IEventCollection {
}

interface IStartRevision {
    [key: string]: IStartRevisionValues;
}

interface IListStreamSubscription {
    [key: string]: PersistentSubscription;
}


export {
    EventEmitter,
    bigInt,
    PersistentSubscription,
    EventCollection,
    persistentSubscriptionSettingsFromDefaults,
    PersistentSubscriptionBase,
    jsonEvent,
    EventStoreDBClient,
    END,
    IDataLinkEvent,
    IEventHandlerGroup,
    IListStreamSubscription,
    IStartRevision,
    StreamSubscription,
    IAvailableEvent,
    IReadStreamConfig,
    IEvenStoreConfig,
    IQueue,
    IQueueCustom,
    IStream,
    ITemplateEvent,
    EventType,
    IStartRevisionValues,
    Method,
    MethodList,
    EMethodList,
    JSONType,
    BACKWARDS,
    EventData,
    md5
}
