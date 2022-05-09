/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 11/02/2022
 **  @Description
 ***********************************************************/


import EventHandler from "./handler";
import EventConsumer from "./consumer";
import EventsPlugin from "./client";
import {IEvenStoreConfig, IEventHandlerGroup, Method, JSONType, IQueue, IQueueCustom} from "./core/global";


class _EventsPlugin<T> {}
class _EventConsumer {}
class _EventHandler {}


export type IClient = { new<DataModel extends JSONType>(EvenStoreConfig: IEvenStoreConfig, streamName: string, methods: string[], causationRoute: string[]): _EventsPlugin<DataModel>; prototype: _EventsPlugin<any> }
export type IConsumer = { new(EvenStoreConfig: IEvenStoreConfig, StreamName: string, queue:IQueue | IQueueCustom, group?: IEventHandlerGroup): _EventConsumer; prototype: _EventConsumer }
export type IHandler = { new(EvenStoreConfig: IEvenStoreConfig, group?: IEventHandlerGroup): _EventHandler; prototype: _EventHandler }

const Instance = (type: 'handler' | 'consumer' | 'client', mongoose: any): EventHandler | IConsumer | IClient => {
    switch (type) {
        case 'handler':
            // @ts-ignore
            return EventHandler;
        case 'consumer':
            return EventConsumer(mongoose);
        case 'client':
            return EventsPlugin(mongoose);
    }
}

export default Instance;
