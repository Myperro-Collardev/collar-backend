import express from 'express';
import bodyParser from 'body-parser';

const app = express();
const port = 3000;
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send({"message": "bow bow"});
    console.log({"message": "bow bow"});
});

app.post('/sensor_data', (req, res) => {
    console.log(req.body);
    res.send({"message": req.body});
});

app.listen(port,(res,req)=>{
    console.log(`listening on ${port}`);
});