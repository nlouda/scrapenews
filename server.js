// Dependencies
const express = require("express");
const logger = require("morgan");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const path = require("path");
// Scraping tools
const request = require("request");
const cheerio = require("cheerio");
// Requiring Note and Article models
var Article = require("./models/Article");
var Note = require("./models/Note");

//Define port
const PORT = process.env.PORT || 3000

// Initialize Express
const app = express();

// Use morgan and body parser with our app
app.use(logger("dev"));
app.use(express.urlencoded({
  extended: true
}));
app.use(express.json());
// Make public a static dir
app.use(express.static("public"));

// Set Handlebars.
var exphbs = require("express-handlebars");

app.engine("handlebars", exphbs({
  defaultLayout: "main"
}));
app.set("view engine", "handlebars");
// if deployed, use the deployed database. otherwise use the local
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/scrapenews";

mongoose.Promise = Promise;
// Database configuration with mongoose
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useCreateIndex: true,
  useFindAndModify: false
});

var db = mongoose.connection;

// Show any mongoose errors
db.on("error", function (error) {
  console.log("Mongoose Error: ", error);
});

// Once logged in to the db through mongoose, log a success message
db.once("open", function () {
  console.log("Mongoose connection successful.");
});

// Routes

app.get("/", function (req, res) {
  Article.find({
    "saved": false
  }, function (error, data) {
    var hbsObject = {
      article: data
    };
    console.log(hbsObject);
    res.render("home.handlebars", hbsObject);
  });
});

app.get("/saved", function (req, res) {
  Article.find({
    "saved": true
  }).populate("notes").exec(function (error, articles) {
    var hbsObject = {
      article: articles
    };
    res.render("saved", hbsObject);
  });
});

// A GET request to scrape the echojs website
app.get("/scrape", function(req, res) {
      // First, we grab the body of the html with request
      request("https://www.nytimes.com/", function(error, response, html) {
          // Then, we load that into cheerio and save it to $ for a shorthand selector
          var $ = cheerio.load(html);
          // Now, we grab every h2 within an article tag, and do the following:
          $("article").each(function(i, element) {

            // Save an empty result object
            var result = {};

            // Add the title and summary of every link, and save them as properties of the result object
            result.title = $(this).children("h2").text();
            result.summary = $(this).children(".summary").text();
            result.link = $(this).children("h2").children("a").attr("href");

            let entry = new Article(result);
            // Now, save that entry to the db
            entry.save(function(error, doc) {
              // Log any errors
              if (error) {
                console.log(error);
              }
              // Or log the doc
              else {
                console.log(doc);
              }
            });
          });
            res.send("Scrape Complete");
        });
          // Tell the browser that we finished scraping the text
      });
    // This will get the articles we scraped from the mongoDB
    app.get("/articles", function (req, res) {
      // Grab every doc in the Articles array
      Article.find({}, function(error,doc){
        if(error){
          console.log(error);
        }
       else{
         res.json(doc);
       }
      });
    });

    // Grab an article by it's ObjectId
    app.get("/articles/:id", function (req, res) {
      // Using the id passed in the id parameter, prepare a query that finds the matching one in our db...
      Article.findOne({
          "_id": req.params.id
        })
        // ..and populate all of the notes associated with it
        .populate("note")
        // now, execute our query
        .exec(function(error, doc) {
          if(error){
            console.log(error);
          }
        else{
          res.json(doc);
        }
    });
  });

    // Save an article
    app.post("/articles/save/:id", function (req, res) {
      // Use the article id to find and update its saved boolean
      Article.findOneAndUpdate({
          "_id": req.params.id
        }, {
          "saved": true
        })
        // Execute the above query
        .exec(function (err, doc) {
          // Log any errors
          if (err) {
            console.log(err);
          } else {
            // Or send the document to the browser
            res.send(doc);
          }
        });
    });

    // Delete an article
    app.post("/articles/delete/:id", function (req, res) {
      // Use the article id to find and update its saved boolean
      Article.findOneAndUpdate({
          "_id": req.params.id
        }, {
          "saved": false,
          "notes": []
        })
        // Execute the above query
        .exec(function (error, doc) {
          // Log any errors
          if (error) {
            console.log(error);
          } else {
            // Or send the document to the browser
            res.send(doc);
          }
        });
    });


    // Create a new note
    app.post("/notes/save/:id", function (req, res) {
      // Create a new note and pass the req.body to the entry
      var newNote = new Note({
        body: req.body.text,
        article: req.params.id
      });
      console.log(req.body)
      // And save the new note the db
      newNote.save(function (error, note) {
        // Log any errors
        if (error) {
          console.log(error);
        }
        // Otherwise
        else {
          // Use the article id to find and update it's notes
          Article.findOneAndUpdate({
              "_id": req.params.id
            }, {
              $push: {
                "notes": note
              }
            })
            // Execute the above query
            .exec(function (err) {
              // Log any errors
              if (err) {
                console.log(err);
                res.send(err);
              } else {
                // Or send the note to the browser
                res.send(note);
              }
            });
        }
      });
    });

    // Delete a note
    app.delete("/notes/delete/:note_id/:article_id", function (req, res) {
      // Use the note id to find and delete it
      Note.findOneAndRemove({
        "_id": req.params.note_id
      }, function (err) {
        // Log any errors
        if (err) {
          console.log(err);
          res.send(err);
        } else {
          Article.findOneAndUpdate({
              "_id": req.params.article_id
            }, {
              $pull: {
                "notes": req.params.note_id
              }
            })
            // Execute the above query
            .exec(function (err) {
              // Log any errors
              if (err) {
                console.log(err);
                res.send(err);
              } else {
                // Or send the note to the browser
                res.send("Note Deleted");
              }
            });
        }
      });
    });

    // Listen on port
    app.listen(PORT, function () {
      console.log("App running on port " + PORT);
    });