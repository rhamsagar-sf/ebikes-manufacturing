import Configuration from './utils/configuration.js';
import WebSocketService from './services/webSocketService.js';
import SalesforceClient from './services/salesforceClient.js';
import OrderRestResource from './api/orderRestResource.js';
import { createServer } from 'lwr';
import PubSubApiClient from 'salesforce-pubsub-api-client';

//const ORDER_CDC_TOPIC = '/data/Order__ChangeEvent';
const CASE_CDC_TOPIC = '/data/CaseChangeEvent';
const MANUFACTURING_PE_TOPIC = '/event/Manufacturing_Event__e';

async function start() {
    Configuration.checkConfig();

    // Configure server
    const lwrServer = createServer();
    const app = lwrServer.getInternalServer();
    const wss = new WebSocketService();

    // Connect to Salesforce
    // Disclaimer: change this and use JWT auth in production!
    const sfClient = new SalesforceClient();
    await sfClient.connect(
        Configuration.getSfLoginUrl(),
        Configuration.getSfUsername(),
        Configuration.getSfSecuredPassword(),
        Configuration.getSfApiVersion()
    );
    const conMetadata = sfClient.getConnectionMetadata();

    // Connect to Pub Sub API
    const pubSubClient = new PubSubApiClient();
    await pubSubClient.connectWithAuth(
        conMetadata.accessToken,
        conMetadata.instanceUrl,
        conMetadata.organizationId,
        Configuration.getSfUsername()
    );
    // Subscribe to Change Data Capture events on Reseller Order records
    // const orderCdcEmitter = await pubSubClient.subscribe(ORDER_CDC_TOPIC, 10);
    // orderCdcEmitter.on('data', (cdcEvent) => {
    //     const status = cdcEvent.payload.Status__c?.string;
    //     const header = cdcEvent.payload.ChangeEventHeader;
    //     // Filter events related to order status updates
    //     if (header.changeType === 'UPDATE' && status) {
    //         header.recordIds.forEach((orderId) => {
    //             // Notify client via WebSocket
    //             const message = {
    //                 type: 'manufacturingEvent',
    //                 data: {
    //                     orderId,
    //                     status
    //                 }
    //             };
    //             wss.broadcast(JSON.stringify(message));
    //         });
    //     }
    // });
    const caseCdcEmitter = await pubSubClient.subscribe(CASE_CDC_TOPIC, 5);
    caseCdcEmitter.on('data', (cdcEvent) => {
        const status = cdcEvent.payload.Status__c?.string;
        const header = cdcEvent.payload.ChangeEventHeader;
        console.log('header', header)
        console.log('header', header.recordIds)
        // Filter events related to order status updates
       // if (header.changeType === 'UPDATE' && status) {
            header.recordIds.forEach((caseId) => {
                // Notify client via WebSocket
                const message1 = {
                    type: 'caseEvent',
                    data: {
                        caseId,
                        status
                    }
                };
                wss.broadcast(JSON.stringify(message1));
            });
        //}
    });

    // Handle incoming WS events
    wss.addMessageListener(async (message) => {
        // const { orderId, status } = message.data;
        // const eventData = {
        //     CreatedDate: Date.now(),
        //     CreatedById: sfClient.client.userInfo.id,
        //     Order_Id__c: { string: orderId },
        //     Status__c: { string: status }
        // };
        const { Id, status } = message1.data;
        const eventData1 = {
            CreatedDate: Date.now(),
            CreatedById: sfClient.client.userInfo.id,
            Order_Id__c: { string: Id },
            Status__c: { string: status }
        };
        //await pubSubClient.publish(MANUFACTURING_PE_TOPIC, eventData1);
        //console.log('Published Manufacturing_Event__e', eventData1);
    });

    // Handle incoming WS events
    /* wss.addMessageListener(async (message1) => {
        
        await pubSubClient.publish(MANUFACTURING_PE_TOPIC, eventData);
        console.log('Published Manufacturing_Event__e', eventData);
    });*/

    // Setup REST resources
    const orderRest = new OrderRestResource(sfClient.client);
    app.get('/api/orders', (request, response) => {
        orderRest.getOrders(request, response);
    });
    app.get('/api/orders/:orderId', (request, response) => {
        orderRest.getOrder(request, response);
    });
    app.get('/api/orders/:orderId/items', (request, response) => {
        orderRest.getOrderItems(request, response);
    });

    // HTTP and WebSocket Listen
    wss.connect(lwrServer.server);
    lwrServer
        .listen(({ port, serverMode }) => {
            console.log(
                `App listening on port ${port} in ${serverMode} mode\n`
            );
        })
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}

start();
