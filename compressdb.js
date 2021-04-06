const Datastore = require("nedb");

const database = new Datastore("database.db");
database.loadDatabase();
database.persistence.compactDatafile;
