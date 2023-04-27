/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 10/02/2022
 **  @Description
 ***********************************************************/
import {
	END,
	EventStoreDBClient,
	IEvenStoreConfig,
	IEventHandlerGroup,
	IListStreamSubscription,
	IStartRevision,
	ITemplateEvent,
	ITriggerList,
	jsonEvent,
	Method, START
} from "../core/global";
import {EventParser} from "../core/CommonResponse";
import {
	PersistentSubscriptionToStream,
	persistentSubscriptionToStreamSettingsFromDefaults
}                    from "@eventstore/db-client";

const timerBeforeReboot = 0.5 * 1000 * 60;

const listStreams = async (client: EventStoreDBClient) => {
	const iterator = client.readAll({
		direction: 'backwards',
		maxCount: Number.MAX_SAFE_INTEGER,// adjust as needed
		resolveLinkTos: false,
		fromPosition: START
	});
	const streams = new Set();
	for await (const event of iterator) {
		// @ts-ignore
		streams.add(event.event.streamId);
	}
	return streams;
}


class EventHandler {
	protected methods: Method;
	protected streamName: string[];
	protected group: string;
	protected streamList: string[];
	protected credentials: IEvenStoreConfig["credentials"];
	protected triggerOnComplete: ITriggerList[] = [];
	private readonly client: EventStoreDBClient;
	private StartRevision: IStartRevision;
	private stream: IListStreamSubscription;

	constructor(EvenStoreConfig: IEvenStoreConfig,
	            streamList: string[],
	            triggerOnComplete: ITriggerList[] = [],
	            group: IEventHandlerGroup = 'global-event-handler') {
		this.group = group;
		this.streamList = streamList;
		this.triggerOnComplete = triggerOnComplete || [];
		this.client = new EventStoreDBClient(
			EvenStoreConfig.connexion,
			EvenStoreConfig.security,
			EvenStoreConfig.credentials);


		this.init().then(() => {
			setInterval(() => {
				this.init().catch((e: any) =>
					console.error('Interval Check Like Soron Eyes for Subscribing new queue errored', e))
			}, 1000 * 60)
		}).catch((err) => {
			console.log('Error Constructor._EventHandler', err);
			setTimeout(() => {
				process.exit(1);
			}, timerBeforeReboot)
		})
	}

	private async init() {
		/*this.StartRevision = {};
		this.stream = {};
		for (const stream of this.streamList) {
			console.log('subscribe to stream > %s', stream)
			this.StartRevision[stream] = END;
			await this.CreatePersistentSubscription(stream).catch((err: any) => console.warn('warning', err));
			this.stream[stream] = this.SubscribeToPersistent(stream);
		}
		Object.keys(this.stream).forEach((name: string) => this.dispatcher(this.stream[name])) */

		this.StartRevision = {};
		this.stream = {};
		const existingStream: any = await listStreams(this.client);
		console.log('Existing Stream', existingStream);
		if (existingStream) {
			const filteredEyes = existingStream.filter((e: string) => this.streamList.includes(e))
			const keepNotRegistered = filteredEyes.filter((e: string) => Object.keys(this.stream).indexOf(e) === -1);
			for (const stream of keepNotRegistered) {
				console.log('subscribe to stream > %s', stream)
				this.StartRevision[stream] = END;
				await this.CreatePersistentSubscription(stream)
					.catch((err: any) => console.warn('warning', err));
				this.stream[stream] = this.SubscribeToPersistent(stream);
				await this.dispatcher(this.stream[stream])
			}
		}
	}

	private async dispatcher(subscription: PersistentSubscriptionToStream) {
		for await (const resolvedEvent of subscription) {
			const {event} = resolvedEvent;
			if (event) {
				// @ts-ignore
				if (event.metadata.state === "processing") await this.handler(resolvedEvent);
				await subscription.ack(resolvedEvent);
			}
		}
	}

	private async handler(event: any) {
		const eventParser = new EventParser<any>(event, true);
		const template = this.template(eventParser.type, eventParser.data, eventParser.metadata);

		console.log(
			'isError',
			eventParser.isError,
			'nextRoute',
			eventParser.nextRoute,
			'state',
			eventParser.state,
			'template',
			template
		)

		if (eventParser.isError) await this.client.appendToStream(eventParser.causation, [template])
			.catch((err: any) => {
				console.error(`Error EventHandler.handler.appendToStream.${eventParser.causation}`, err);
			});
		else if (eventParser.nextRoute) await this.client.appendToStream(eventParser.nextRoute, [template])
			.catch((err: any) => {
				console.error(`Error EventHandler.handler.appendToStream.${eventParser.causation}`, err);
			})
		else await this.client.appendToStream(eventParser.causation, [template])
				.catch((err: any) => {
					console.error(`Error EventHandler.handler.appendToStream.${eventParser.causation}`, err);
				})
	}

	private template(type: string, data: any, metadata: ITemplateEvent<any>) {
		return jsonEvent({
			type,
			data,
			metadata
		})
	}

	private SubscribeToPersistent(streamName: string) {
		return this.client.subscribeToPersistentSubscriptionToStream(
			streamName,
			this.group,
			{
				bufferSize: 20
			}
		)
	}

	private async CreatePersistentSubscription(streamName: string): Promise<boolean> {
		try {
			await this.client.createPersistentSubscriptionToStream(
				streamName,
				this.group,
				// @ts-ignore
				persistentSubscriptionToStreamSettingsFromDefaults({
					startFrom: END,
				//	NamedConsumerStrategy: 'DispatchToSingle'
				}),
				{credentials: this.credentials}
			)
			return true;
		} catch (err) {
			const error = (err ? err.toString() : "").toLowerCase();
			const errorsReboot = ['CANCELLED', 'canceled', 'UNAVAILABLE'];
			if (error.includes('EXIST') || error.includes('exist')) {
				console.log('Persistent sudbscription %s already exist', streamName)
				return true;
			} else {
				for (const k of errorsReboot) {
					if (error.includes(k)) {
						console.error('Error EventHandler.CreatePersistentSubscription', k);
						console.error('Error EventHandler.CreatePersistentSubscription', k);
						const timerBeforeReboot = 0.5 * 1000 * 60;
						console.log('calling pod reboot in %d ms', timerBeforeReboot)
						setTimeout(() => {
							process.exit(1);
						}, timerBeforeReboot)
					}
				}
			}
			return false;
		}
	}
}

export default EventHandler
