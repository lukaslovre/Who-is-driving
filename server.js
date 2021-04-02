require("dotenv").config();

// import
const path = require("path");
const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const Datastore = require("nedb");
const bcrypt = require("bcrypt");
const passport = require("passport");
const flash = require("express-flash");
const session = require("express-session");
const methodOverride = require("method-override");

const initializePassport = require("./passport-config");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.set("view engine", "ejs");

// neDB:
const database = new Datastore("database.db");
database.loadDatabase();

// App use
app.use(express.static(__dirname + "/public"));
app.use(express.json());
app.use(
  express.urlencoded({
    extended: false,
  })
);
app.use(flash());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride("_method"));
// ...

initializePassport(
  passport,
  (username) => userData.find((user) => user.username === username),
  (id) => userData.find((user) => user._id === id)
);

let userData;
database.find({}, function (err, docs) {
  userData = docs;
});

/*



        !ROUTES



*/

// Register
app.get("/register", checkNotAuthenticated, (req, res) => {
  res.render("register");
});
app.post("/register", checkNotAuthenticated, (req, res) => {
  // Provjera upisanih podataka
  if (!req.body.username) {
    res.render("register", { err: "Nije uneseno ime" });
  } else if (!req.body.password) {
    res.render("register", { err: "Nije unesen password" });
  } else {
    // Provjera dali već postoji ime
    database.findOne(
      { username: req.body.username },
      async function (err, docs) {
        if (!docs) {
          const hashedPassword = await bcrypt.hash(req.body.password, 5);
          const registerData = {
            username: req.body.username,
            group: [],
            password: hashedPassword,
          };

          database.insert(registerData, function (err, newDoc) {});
          database.find({}, function (err, docs) {
            userData = docs;
          });
          res.redirect("/login");
        } else {
          res.render("register", { err: "Ovaj username je zauzet" });
        }
      }
    );
  }
});

// LOG IN:
app.get("/login", checkNotAuthenticated, (req, res) => {
  res.render("login");
});

app.post(
  "/login",
  checkNotAuthenticated,
  passport.authenticate("local", {
    successRedirect: "/home",
    failureRedirect: "/login",
    failureFlash: true,
  })
);

// Log out
app.delete("/logout", (req, res) => {
  req.logOut();
  res.redirect("/login");
});

// Home
app.get("/home", checkAuthenticated, (req, res) => {
  database.findOne({ username: req.user.username }, function (err, docs) {
    let groups = docs.group;
    let numOfMembers = [];
    if (groups.length == 0) {
      res.render("home");
    } else {
      for (let i = 0; i < groups.length; i++) {
        database.count(
          { "group.groupId": groups[i].groupId },
          function (err, count) {
            numOfMembers.push(count);
            if (numOfMembers.length === groups.length) {
              res.render("home", { groups, numOfMembers });
            }
          }
        );
      }
    }
  });
});

app.get("/", (req, res) => {
  res.redirect("/home");
});

// Join Group
app.get("/join-group", checkAuthenticated, (req, res) => {
  res.render("join-group", { user: req.user });
});

app.post("/joinGroupWithId", checkAuthenticated, (req, res) => {
  const groupID = req.body.groupId;
  // provjeriti id u bazi i naci sve o grupi:
  database.findOne({ username: req.user.username }, function (err, docs) {
    let groups = docs.group;
    let newGroup = {
      groupId: groupID,
      groupName: "grupaTest2",
      balance: 5000,
      bet: 0,
      status: "unready",
    };
    groups.push(newGroup);

    database.update(
      { username: req.user.username },
      { $set: { group: groups } },
      {},
      function (err, numReplaced) {
        // numReplaced = 3
        // Field 'system' on Mars, Earth, Jupiter now has value 'solar system'
      }
    );
  });
  res.redirect("/home");
});

//Lobby
app.get("/lobby/:groupId", checkAuthenticated, (req, res) => {
  database.find({ "group.groupId": req.params.groupId }, function (err, docs) {
    let users = docs;
    let bets = [];
    let ukupniBet = 0;

    // prode svakog usera i svaku grupu njegovu i onda u nizu "group" ostavi samo traženu grupu
    users.forEach((user) => {
      user.group.forEach((oneGroup) => {
        if (oneGroup.groupId == req.params.groupId) {
          ukupniBet += oneGroup.bet;
          bets.push({
            username: user.username,
            bet: oneGroup.bet,
          });
          user.group = oneGroup;
        }
      });
    });
    if (bets.length == 1) {
      bets[0].chance = 1;
    } else {
      for (let i = 0; i < bets.length; i++) {
        bets[i].chance =
          (ukupniBet - bets[i].bet) / ((bets.length - 1) * ukupniBet);
      }
    }

    //console.log(bets);
    //console.log(bets.length);
    //console.log(req.user.username);
    res.render("lobby", { users: users, currentUser: req.user.username, bets });
  });
});

/*


      ! SOCKET IO PENIS



*/

// Run when client connects
io.on("connection", (socket) => {
  socket.on("connectToRoom", (groupId) => {
    socket.join(groupId);
  });

  // upisuje novi state u Db i salje nazad tablicu
  socket.on("stateChange", (username, newState, groupIdFromUrl) => {
    database.findOne({ username }, (err, docs) => {
      let groups = docs.group;
      groups.forEach((group) => {
        if (group.groupId == groupIdFromUrl) {
          group.status = newState;
        }
      });
      database.update({ username }, { $set: { group: groups } });
      //updejta novo stanje u tablici ^^^^^^

      //šalje podatke svih korisnika u toj grupi ˇˇˇˇ
      database.find({ "group.groupId": groupIdFromUrl }, function (err, docs) {
        let users = docs;
        let allGroups = [];
        docs.forEach((user) => {
          allGroups.push(user.group);
        });
        let bets = [];
        let ukupniBet = 0;
        let readyCounter = 0;

        // prode svakog usera i svaku grupu njegovu i onda u nizu "group" ostavi samo traženu grupu

        users.forEach((user) => {
          user.group.forEach((oneGroup) => {
            if (oneGroup.groupId == groupIdFromUrl) {
              ukupniBet += oneGroup.bet;
              bets.push({
                username: user.username,
                bet: oneGroup.bet,
              });
              user.group = oneGroup;
              if (user.group.status == "ready") readyCounter++;
            }
          });
        });
        if (bets.length == 1) {
          bets[0].chance = 1;
        } else {
          for (let i = 0; i < bets.length; i++) {
            bets[i].chance =
              (ukupniBet - bets[i].bet) / ((bets.length - 1) * ukupniBet);
          }
        }

        // ako su svi ready
        if (readyCounter == users.length) {
          // Biranje vozača:
          let chanceSum = 0;
          let rndNumber = Math.random();
          let winnerUsername;
          console.log(bets);
          console.log(rndNumber);

          for (let i = 0; i < bets.length; i++) {
            if (rndNumber <= bets[i].chance + chanceSum) {
              winnerUsername = bets[i].username;
              io.to(groupIdFromUrl).emit(
                "updateValues",
                users,
                bets[i].username
              );
              users.forEach((user) => {
                if (user.username == winnerUsername) {
                  user.group.balance += 10000;
                }
                user.group.status = "unready";
                user.group.bet = 500;
              });

              for (let i = 0; i < allGroups.length; i++) {
                allGroups[i].forEach((oneGroup) => {
                  if (oneGroup.id == users[i].group.id) {
                    oneGroup = users[i].group;
                  }
                });
                database.update(
                  { username: users[i].username },
                  { $set: { group: allGroups[i] } }
                );
              }

              break;
            }
            chanceSum += bets[i].chance;
          }
        } else {
          io.to(groupIdFromUrl).emit("updateValues", users, false); //svima šalje
        }
      });
    });
  });

  /* 
  
                    --------------------------

  */

  // Upisuje novi bet u DB
  socket.on("placeBet", (betAmount, currentUser, groupIdFromUrl) => {
    database.findOne({ username: currentUser }, async (err, docs) => {
      let groups = docs.group;
      let balance;
      groups.forEach((group) => {
        if (group.groupId == groupIdFromUrl) {
          group.bet += parseInt(betAmount);
          group.balance -= parseInt(betAmount);
          balance = group.balance;
        }
      });
      database.update({ username: currentUser }, { $set: { group: groups } });
      //

      database.find({ "group.groupId": groupIdFromUrl }, function (err, docs) {
        let users = docs;
        let bets = [];
        let ukupniBet = 0;

        users.forEach((user) => {
          user.group.forEach((oneGroup) => {
            if (oneGroup.groupId == groupIdFromUrl) {
              ukupniBet += oneGroup.bet;
              bets.push({
                username: user.username,
                bet: oneGroup.bet,
              });
            }
          });
        });

        if (bets.length == 1) {
          bets[0].chance = 1;
        } else {
          for (let i = 0; i < bets.length; i++) {
            bets[i].chance =
              (ukupniBet - bets[i].bet) / ((bets.length - 1) * ukupniBet);
          }
        }

        io.to(groupIdFromUrl).emit("betValues", bets, balance);
      });
    });
  });

  //socket.emit("message", "hello!"); //samo korisniku koji se spojio
  // socket.broadcast.emit("message", "hello!"); //svima osim korisniku koji se spojio
  //io.emit("message", "hello!"); //svima
});

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}
function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect("/home");
  }
  next();
}

// open server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`listening at Port ${PORT}`));
