'use strict';
require('dotenv').config();
const express = require('express');
const myDB = require('./connection');
const fccTesting = require('./freeCodeCamp/fcctesting.js');
const session = require('express-session');
const passport = require('passport');
const routes = require('./routes');
const auth = require('./auth');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const passportSocketIo = require('passport.socketio');
const cookieParser = require('cookie-parser');

const MongoStore = require('connect-mongo').default;
const URI = process.env.MONGO_URI;
const store = MongoStore.create({
  mongoUrl: process.env.MONGO_URI,
  dbName: 'chatApp',
  stringify: false,
})

fccTesting(app); //For FCC testing purposes
app.set('view engine', 'pug');
app.use('/public', express.static(process.cwd() + '/public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: true,
  saveUninitialized: true,
  cookie: { secure: false },
  store: store
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(cookieParser());

app.use((req, res, next) => {
  console.log(req.originalUrl);
  next();
});

io.use(
  passportSocketIo.authorize({
    cookieParser: cookieParser,
    key: 'connect.sid',
    secret: process.env.SESSION_SECRET,
    store: store,
    success: onAuthorizeSuccess,
    fail: onAuthorizeFail
  })
);

function onAuthorizeSuccess(data, accept) {
  console.log('successful connection to socket.io');

  accept(null, true);
}

function onAuthorizeFail(data, message, error, accept) {
  if (error) throw new Error(message);
  console.log('failed connection to socket.io:', message);
  accept(null, false);
}

myDB(async client => {
  const myDataBase = await client.db('chatApp').collection('users');
  routes(app, myDataBase);
  auth(app, myDataBase, io);

  let currentUsers = 0;
  io.on('connection', socket => {
    currentUsers++;
    io.emit('user', {
      name: socket.request.user.username,
      currentUsers,
      connected: true
    });
    console.log('A user has connected');
    socket.on('disconnect', () => {
      currentUsers--;
      io.emit('user', {
        name: socket.request.user.username,
        currentUsers,
        connected: false
      });
      console.log('A user has disconnected');
    });
    socket.on('chat message', (data) => {
      io.emit('chat message', {
        name: socket.request.user.username,
        message: data
      });
    });
  });

  app.use((req, res, next) => {
    res.status(404)
      .type('text')
      .send('Not Found');
  });
  // Be sure to add this...
}).catch(e => {
  app.route('/').get((req, res) => {
    res.render('pug', { title: e, message: 'Unable to login' });
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log('Listening on port ' + PORT);
});
