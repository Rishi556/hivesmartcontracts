require('dotenv').config();
const axios = require('axios');
const dhive = require('@hiveio/dhive');
const program = require('commander');
const { exec } = require('child_process');
const packagejson = require('./package.json');
const config = require('./config.json');

const ip = process.env.NODE_IP;
const domain = process.env.NODE_DOMAIN;
const witnessAccount = process.env.ACCOUNT;
const privateSigningKey = dhive.PrivateKey.fromString(process.env.ACTIVE_SIGNING_KEY);
const publicSigningKey = privateSigningKey.createPublic().toString();
const {
  rpcNodePort, p2pPort, streamNodes, chainId,
} = config;

// For external NATed-ports customization
const extRPCNodePort = Number(String(process.env.RPCNODEPORT)) || rpcNodePort;
const extP2PPort = Number(String(process.env.P2PPORT)) || p2pPort;

program
  .option('-v, --verify', 'verify transaction on hive-engine', false)
  .option('-e, --engineNode [url]', 'verify with given hive-engine node', 'https://engine.rishipanthee.com')
  .option('-d, --diverganceCheck', 'check for divergance against the given hive-engine node', false)
  .parse(process.argv);

let { engineNode } = program;
const { verify, diverganceCheck } = program;

engineNode = engineNode.replace(/\/$/, '');

function awaitValidation(trxID, tries = 1) {
  axios.post(`${engineNode}/blockchain`, {
    jsonrpc: '2.0', id: 0, method: 'getTransactionInfo', params: { txid: trxID },
  }).then((res) => {
    if (res.data.result) {
      const parsedLogs = JSON.parse(res.data.result.logs);
      if (parsedLogs.errors) {
        // eslint-disable-next-line no-console
        console.log(`Failed action with reason "${parsedLogs.errors[0]}", your trx id: ${trxID}`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`Successfull, transaction id is ${trxID}`);
      }
    } else {
      if (tries >= 4) {
        // eslint-disable-next-line no-console
        console.log(`Successful broadcast but could not verify, trx id: ${trxID}`);
        return;
      }
      setTimeout(() => {
        awaitValidation(trxID, tries + 1);
      }, 4000);
    }
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.log(err);
    if (tries >= 4) {
      // eslint-disable-next-line no-console
      console.log(`Successful broadcast but could not verify, trx id: ${trxID}`);
      return;
    }
    setTimeout(() => {
      awaitValidation(trxID, tries + 1);
    }, 4000);
  });
}

function broadcastWitnessAction(contractAction, contractPayload) {
  const client = new dhive.Client(streamNodes[0]);
  const transaction = {
    required_auths: [witnessAccount],
    required_posting_auths: [],
    id: `ssc-${chainId}`,
    json: JSON.stringify({
      contractName: 'witnesses',
      contractAction,
      contractPayload,
    }),
  };

  client.broadcast.json(transaction, privateSigningKey).then((res) => {
    if (verify) {
      awaitValidation(res.id);
    } else {
      // eslint-disable-next-line no-console
      console.log(`Successful, trx id: ${res.id}`);
    }
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Error', err);
  });
}

program.version(packagejson.version);
program
  .command('approve <witness>')
  .action((witness) => broadcastWitnessAction('approve', { witness }));
program
  .command('disapprove <witness>')
  .action((witness) => broadcastWitnessAction('disapprove', { witness }));

program
  .command('register')
  .action(() => {
    const registerJSON = {
      RPCPort: extRPCNodePort,
      P2PPort: extP2PPort,
      signingKey: publicSigningKey,
      enabled: false,
    };
    if (ip && domain) {
      // eslint-disable-next-line no-console
      console.log('Both domain and IP specified in your .env file, please only use one');
      return;
    } if (ip) {
      registerJSON.IP = ip;
    } else if (domain) {
      registerJSON.domain = domain;
    } else {
      // eslint-disable-next-line no-console
      console.log('Missing domain or IP, please add it to your .env file');
      return;
    }
    if (diverganceCheck) {
      exec(`node find_divergent_block.js -h -n ${engineNode}`).on('exit', (code) => {
        if (code !== 0) {
          // eslint-disable-next-line no-console
          console.log(`A divergent block was found, not registering. Run node find_divergent_block.js -n ${engineNode} to learn where.`);
        } else {
          broadcastWitnessAction('register', registerJSON);
        }
      });
    } else {
      broadcastWitnessAction('register', registerJSON);
    }
  });

program
  .command('unregister')
  .action(() => {
    const registerJSON = {
      RPCPort: extRPCNodePort,
      P2PPort: extP2PPort,
      signingKey: publicSigningKey,
      enabled: false,
    };
    if (ip && domain) {
      // eslint-disable-next-line no-console
      console.log('Both domain and IP specified in your .env file, please only use one');
      return;
    } if (ip) {
      registerJSON.IP = ip;
    } else if (domain) {
      registerJSON.domain = domain;
    } else {
      // eslint-disable-next-line no-console
      console.log('Missing domain or IP, please add it to your .env file');
      return;
    }
    broadcastWitnessAction('register', registerJSON);
  });

program.parse(process.argv);
