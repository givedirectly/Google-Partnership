import {createServer} from 'http';
import {generateEarthEngineToken} from '../ee_lib/ee_token_creator.mjs';

createServer((req, res) => {
    generateEarthEngineToken().then((data) => {
      res.writeHead(200, {'Content-type': 'text/plain', 'Access-Control-Allow-Origin': '*'});
      const stringData = JSON.stringify(data);
      console.log(stringData);
      res.write(stringData);
      res.end();
    })}).listen(9080);