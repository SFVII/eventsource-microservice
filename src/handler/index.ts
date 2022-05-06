/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 10/02/2022
 **  @Description
 ***********************************************************/
import {
    EventCollection,
    EventStoreDBClient,
    IAvailableEvent,
    IEvenStoreConfig,
    IEventHandlerGroup,
    IListStreamSubscription,
    IStartRevision,
    ITemplateEvent,
    jsonEvent,
    Method,
    PersistentSubscription,
    persistentSubscriptionSettingsFromDefaults,
    START
} from "../core/global";

// @ts-ignore
const EventHandler = (mongoose: any) => {
    const _EventCollection = EventCollection(mongoose);
    return class _EventHandler {
        protected methods: Method;
        protected streamName: string[];
        protected group: string;
        protected credentials: IEvenStoreConfig["credentials"];
        private client: EventStoreDBClient;
        private StartRevision: IStartRevision;
        private stream: IListStreamSubscription;

        constructor(EvenStoreConfig: IEvenStoreConfig, group: IEventHandlerGroup = 'dispatch') {
            this.group = group;
            this.client = new EventStoreDBClient(
                EvenStoreConfig.connexion,
                EvenStoreConfig.security,
                EvenStoreConfig.credentials);
            this.init().catch((err) => {
                console.log('Error Constructor._EventHandler', err);
            })
        }

        private async init() {
            this.StartRevision = {};
            this.stream = {};
            const availableEvent: IAvailableEvent[] = await _EventCollection.find({
                Active: {$ne: false},
                Service: true
            }).select([
                'StreamName',
                'Revision',
                'Service',
                'IsCreatedPersistent'
            ]).lean();
            this.streamName = availableEvent.map((event: IAvailableEvent) => event.StreamName);
            for (const EventStream of availableEvent) {
                this.StartRevision[EventStream.StreamName] = START;
                await this.CreatePersistentSubscription(EventStream.StreamName);
                this.stream[EventStream.StreamName] = this.SubscribeToPersistent(EventStream.StreamName);
            }
            Object.keys(this.stream).forEach((name: string) => this.dispatcher(this.stream[name]))
            // console.log(this.stream);
            console.log(availableEvent);
        }

        private async dispatcher(subscription: PersistentSubscription) {
            for await (const resolvedEvent of subscription) {
                const {event} = resolvedEvent;
                if (event) {
                    await this.handler(event);
                    await subscription.ack(resolvedEvent);
                }
            }
        }

        private async handler(event: any) {
            if (Array.isArray(event.metadata.causationRoute)) {
                console.log('EventHandler', event.metadata.causationRoute, event.metadata.state)
                const Routes = event.metadata.causationRoute;
                const nextRoute: string | string[] | undefined = Routes.shift();
                console.log('Next Route', nextRoute)
                if (nextRoute) {
                    if (event.metadata && event.metadata.state === "error") {
                        const template = this.template(event.type, event.data, {
                            $correlationId: event.metadata.$correlationId,
                            $causationId: event.metadata.$causationId,
                            state: event.metatada.state,
                            causationRoute: null
                        });
                        //console.log('send event to >', event.streamId, template);
                        await this.client.appendToStream(event.streamId, [template]).catch((err: any) => {
                            console.error(`Error EventHandler.handler.appendToStream.${event.streamId}`, err);
                        })
                    } else if (event.metadata && (event.metadata.state === 'processing')) {

                        if (nextRoute && Array.isArray(nextRoute)) {
                            const template = this.template(event.type, event.data, {
                                $correlationId: event.metadata.$correlationId,
                                $causationId: event.streamId,
                                state: "system",
                                causationRoute: null
                            });
                            nextRoute.forEach((route: string) => this.client.appendToStream(route, [template])
                                .catch((err: any) => {
                                    console.error(`Error EventHandler.handler.appendToStream.${nextRoute}`, err);
                                }))
                            event.metadata.causationRoute = Routes;
                            await this.handler(event);
                        } else {
                            const template = this.template(event.type, event.data, {
                                $correlationId: event.metadata.$correlationId,
                                $causationId: event.streamId,
                                state: Routes.length ? "processing" : "completed",
                                causationRoute: Routes
                            });
                            await this.client.appendToStream(nextRoute, [template]).catch((err: any) => {
                                console.error(`Error EventHandler.handler.appendToStream.${nextRoute}`, err);
                            })
                        }
                        // console.log('send event to >', nextRoute, template);

                    } else if (event.metadata.state === 'delivered') {
                        // @todo check if event.nack exist
                        //event.ack(event);
                    }
                }
            } else {
                console.warn('BAD EVENT FORMAT', event)
            }
        }

        private template(type: string, data: any, metadata: ITemplateEvent) {
            return jsonEvent({
                type,
                data,
                metadata
            })
        }

        private SubscribeToPersistent(streamName: string) {
            return this.client.subscribeToPersistentSubscription(
                streamName,
                this.group
            )
        }

        private async CreatePersistentSubscription(streamName: string): Promise<boolean> {
            try {
                await this.client.createPersistentSubscription(
                    streamName,
                    this.group,
                    persistentSubscriptionSettingsFromDefaults({
                        startFrom: this.StartRevision[streamName],
                        resolveLinkTos: true
                    }),
                    {credentials: this.credentials}
                )
                await _EventCollection.updateOne({
                    StreamName: streamName,
                    IsCreatedPersistent: true
                }).exec();
                return true;
            } catch (err) {
                const error = (err ? err.toString() : "").toLowerCase();
                if (error.includes('EXIST') || error.includes('exist')) {
                    console.log('Persistent subscription %s already exist', streamName)
                    return true;
                } else console.error('Error EventHandler.CreatePersistentSubscription', err);
                return false;
            }
        }
    }
}

export default EventHandler
