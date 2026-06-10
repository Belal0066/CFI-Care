const client = require('prom-client');



//  for auth audit
const authEventCounter = new client.Counter({
    name: 'security_auth_events_total',
    help: 'Total number of authentication events',
    labelNames: ['eventType', 'status'] 
});

// for grants audit

const securityEventCounter = new client.Counter({
    name: 'security_access_events_total',
    help: 'Total number of data access and security events',
    labelNames: ['namespace', 'eventType', 'actorType', 'status', 'reason']
});



module.exports = {securityEventCounter, authEventCounter};