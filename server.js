const express = require("express");
const path = require("path");
const http = require("http");
const socketio = require("socket.io");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const messageAdapter = require("./utils/messageAdapter"); // Use This Adapter To Format Messages
const mongoClient = require("mongodb").MongoClient;
const dbname = "chatApp";
const chatCollection = "chats"; //collection to store all chats
const userCollection = "onlineUsers"; //collection to maintain list of currently online users
const port = 5000;
const database = "mongodb://localhost:27017/";
const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "http://localhost:5000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});
// server css as static
app.use(express.static(__dirname));
// initialize body-parser to parse incoming parameters requests to req.body
app.use(bodyParser.urlencoded({ extended: true }));
app.get("/index.html", (req, res) => {
  res.sendFile(__dirname + "/front/index.html");
});
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/front/index.html");
});
app.use(express.static(path.join(__dirname, "front")));
// route for handling 404 requests(unavailable routes)
app.use(function (req, res, next) {
  res.status(404).send("شرمنده چیزی پیدا نشد!!!");
});
io.on("connection", (socket) => {
  console.log("New User Logged In with ID " + socket.id);
  //Collect message and insert into database
  socket.on("chatMessage", (data) => {
    //recieves message from client-end along with sender's and reciever's details
    var dataElement = messageAdapter(data);
    mongoClient.connect(database, (err, db) => {
      if (err) throw err;
      else {
        var onlineUsers = db.db(dbname).collection(userCollection);
        var chat = db.db(dbname).collection(chatCollection);
        chat.insertOne(dataElement, (err, res) => {
          //inserts message to into the database
          if (err) throw err;
          socket.emit("message", dataElement); //emits message back to the user for display
        });
        onlineUsers.findOne({ name: data.toUser }, (err, res) => {
          //checks if the recipient of the message is online
          if (err) throw err;
          if (res != null)
            //if the recipient is found online, the message is emmitted to him/her
            socket.to(res.ID).emit("message", dataElement);
        });
      }
      db.close();
    });
  });
  socket.on("userDetails", (data) => {
    //checks if a new user has logged in and recieves the established chat details
    mongoClient.connect(database, (err, db) => {
      if (err) throw err;
      else {
        var currentCollection = db.db(dbname).collection(chatCollection);
        currentCollection
          .find(
            {
              //finds the entire chat history between the two people
              from: { $in: [data.fromUser, data.toUser] },
              to: { $in: [data.fromUser, data.toUser] },
            },
            { projection: { _id: 0 } }
          )
          .toArray((err, res) => {
            if (err) throw err;
            else {
              socket.emit("output", res); //emits the entire chat history to client
            }
          });
      }
      db.close();
    });
  });
  var userID = socket.id;
  // socket.on("disconnect", () => {
  //   mongoClient.connect(database, function (err, db) {
  //     if (err) throw err;
  //     var onlineUsers = db.db(dbname).collection(userCollection);
  //     var myquery = { ID: userID };
  //     onlineUsers.deleteOne(myquery, function (err, res) {
  //       //if a user has disconnected, he/she is removed from the online users' collection
  //       if (err) throw err;
  //       console.log("User " + userID + "went offline...");
  //       db.close();
  //     });
  //   });
  // });
  // Register User
  socket.on("setUsername", function (data) {
    mongoClient.connect(database, function (err, db) {
      if (err) throw err;
      var dbo = db.db(dbname);
      var query = { name: data.name };
      var onlineUsers = dbo.collection(userCollection);
      onlineUsers.find(query).toArray(function (error, res) {
        if (error) throw error;
        if (res.length > 0) {
          socket.emit("userExists", data.name + " این نام کاربری تکراری است ، لطفا نام دیگری انتخاب کنید.");
        } else {
          var onlineUsers = dbo.collection(userCollection);
          var hashedPassword = bcrypt.hashSync(data.password, 10);
          var doc = { ID: socket.id, name: data.name, password: hashedPassword };
          onlineUsers.insertOne(doc, function (e, result) {
            if (e) throw e;
            socket.emit("userSet", { data: doc, result: result, ok: 1 });
          });
        }
      });
    });
  });
  socket.on("authenticate", function (data) {
    mongoClient.connect(database, function (err, db) {
      if (err) throw err;
      var dbo = db.db(dbname);
      var password = data.password;
      var query = { name: data.name };
      dbo
        .collection(userCollection)
        .find(query)
        .toArray(function (error, res) {
          if (error) throw error;
          if (res.length > 0) {
            if (bcrypt.compareSync(password, res[0].password)) {
              var doc = { ID: socket.id, name: res[0].name };
              var myquery = { ID: res[0].ID };
              var newDoc = { $set: { ID: socket.id } };
              dbo.collection(userCollection).updateOne(myquery, newDoc, (err, res1) => {
                if (err) throw err;
                socket.emit("userSet", { data: doc, result: res, ok: 1 });
              });
            } else {
              socket.emit("notAuthenticated", "پسورد وارد شده صحیح نیست!");
            }
          } else {
            socket.emit("notAuthenticated", "لطفا ابتدا ثبت نام کنید.");
          }
        });
    });
  });
});
server.listen(port, () => {
  console.log(`Chat Server listening to port ${port}...`);
});