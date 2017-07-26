var promise = require('bluebird');
var app = require('express')();
var http = require('http');
var io = require('socket.io')(http);
var userList = [];
var typingUsers = {};

var options = {
  // Initialization Options
  promiseLib: promise
};
//pg://postgres:Thutrang91@localhost:5432/template_postgis
var pgp = require('pg-promise')(options);
var connectionString = 'postgres://postgres:1@localhost:5432/LocationTracker';
var db = pgp(connectionString);

var server = http.createServer(app)
  , io = require('socket.io').listen(server);

server.listen(8080);

// routing
app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

// usernames which are currently connected to the chat
var usernames = {};
//var userID;
// rooms which are currently available in chat
//var rooms = ['room1','room2','room3'];
var rooms = {};
var results = [];

io.sockets.on('connection', function (socket) {

	// when the client emits 'adduser', this listens and executes
	socket.on('adduser', function(deviceid, groupname){
		// store the username in the socket session for this client
		socket.deviceid = deviceid;
		// store the room name in the socket session for this client
		socket.groupname = groupname;
		// add the client's username to the global list
		usernames[deviceid] = deviceid;
		// send client to room 1
		socket.join(groupname);
		// echo to client they've connected
		socket.emit('updatechat', 'SERVER', 'you have connected to ' + groupname);
		// echo to room 1 that a person has connected to their room
		socket.broadcast.to(groupname).emit('updatechat', 'SERVER', deviceid + ' has connected to this room');
		socket.emit('updaterooms', rooms, groupname);
	});

	// when the client emits 'sendchat', this listens and executes
	socket.on('sendchat', function (data) {
		// we tell the client to execute 'updatechat' with 2 parameters
		io.sockets.in(socket.groupname).emit('updatechat', socket.deviceid, data.content);
	});
  socket.on('sendimg', function (data) {
		// we tell the client to execute 'updatechat' with 2 parameters
		//io.sockets.in(socket.groupname).emit('updatechat', socket.deviceid, data.content);
    var query = db.query('select url, lat, lon from imagesupload where usercreate=$1',[socket.deviceid])
    query.on('row', (row) => {
      results.push(row);
    });
    // After all data is returned, close connection and return results
    query.on('end', () => {
      done();
      socket.broadcast.to(groupname).emit('updatechat', socket.deviceid, JSON.stringify(results.rows, null, "    "));;
    });

	});
  // when the user disconnects.. perform this
	socket.on('disconnect', function(){
		// remove the username from global usernames list
		delete usernames[socket.deviceid];
		// update list of users in chat, client-side
		io.sockets.emit('updateusers', usernames);
		// echo globally that this client has left
		socket.broadcast.emit('updatechat', 'SERVER', socket.deviceid + ' has disconnected');
		socket.leave(socket.groupname);
	});
});

/*function getOneUser(req, res, next) {
  db.any('select * from userprofile where deviceid = $1', [req.body.deviceid])
    .then(function (data) {
      res.status(200)
        .json({
          status: 'success',
          data: data,
        });
    })
    .catch(function (err) {
      return next(err);
    });
}*/

function CheckContacts(req, res, next){
      db.one('select username, phonenumber, email from userprofile where email=$1 or phonenumber=$2', [req.body.email, req.body.phonenumber])
        .then(function (data){
          res.status(200)
            .json({
              status: 'have contact',
              data: data,
            });
        })
        .catch(function (err) {
          return next(err);
        });
}

//Login using deviceid
function Login(req, res, next) {
    //userID = req.params.id;
    console.log(req.body.deviceid);
    db.one('select * from userprofile where deviceid = $1', [req.body.deviceid])
      .then(function (data){
        res.status(200)
          .json({
            status: 'success',
            data: data
          });
      })
      .catch(function (err) {
        db.query('insert into userprofile(deviceid) values($1)', [req.body.deviceid])
          .then(function(data){
              res.status(200)
                .json({
                    status: 'User not exists',
                    data: data
                });
              });
        });
}

function createGroup(req, res, next) {
  console.log(req.body.groupname)
  //db.query('insert into grouplist(groupname, description, usercreate) value($1,$2,$3)',[req.body.groupname,
  //req.body.description, req.body.usercreate])
  db.none('insert into grouplist(groupname, description, usercreate)' +
      'values(${groupname}, ${description}, ${usercreate})',req.body)
    .then(function () {
      res.status(200)
        .json({
          status: 'success',
          message: 'Created group'
        });
    })
    .catch(function (err) {
      return next(err);
    });

}
function listGroup(req, res, next){
  db.one('select groupname, groupid from groupmember, grouplist where grouplist.groupid=groupmember.groupid and groupmember.userid=$1', [req.body.deviceid])
    .then(function (data) {
        res.status(200)
          .json({
            status: 'success',
            data: data
          });
    })
    .catch(function (err) {
      return next(err);
    });
}
function selectGroup(req, res, next){
  db.one('select username, lat, lon from userprofile, groupmember, grouplist where groupmember.userid=userprofile.userid and grouplist.groupid=groupmember.groupid and grouplist.groupid= $1', [req.body.groupid])
    .then(function (data) {
        res.status(200)
          .json({
            status: 'success',
            data: data
          });
    })
    .catch(function (err) {
      return next(err);
    });
}

function addGroupMember(req, res, next) {
  db.one('INSERT INTO groupmember (groupid, userid) SELECT grouplist.groupid, userprofile.userid FROM grouplist, userprofile WHERE grouplist.groupname=$1 AND userprofile.phonenumber=$2;',
  [req.body.groupname, req.body.phonenumber])
    .then(function () {
        res.status(200)
          .json({
            status: 'success',
            message: 'inserted'
          });
    })
    .catch(function (err) {
      return next(err);
    });
}

function deleteGroupMember(req, res, next) {
  var userID = req.params.userid;
  db.result('delete from groupmember where userid = $1', userID)
    .then(function (result) {
      res.status(200)
        .json({
          status: 'success',
          message: `Removed ${result.rowCount} user`
        });
    })
    .catch(function (err) {
      return next(err);
    });
}

function updateUser(req, res, next) {
  db.query('update userprofile set username=$1, userimage=$2, email=$3, lat=$4, lon=$5, phonenumber=$6 where deviceid=$7',
    [req.body.username, req.body.userimage, req.body.email, req.body.lat, req.body.lon,
      req.body.phonenumber, req.body.deviceid])
    .then(function () {
      res.status(200)
        .json({
          status: 'success',
          message: 'Updated user'
        });
    })
    .catch(function (err) {
      return next(err);
    });
}

function updateLocation(req, res, next) {
  db.query('update userprofile set lat=$1, lon=$2 where deviceid=$3',
    [req.body.lat, req.body.lon,req.body.deviceid])
    .then(function () {
      res.status(200)
        .json({
          status: 'success',
          message: 'Updated location'
        });
    })
    .catch(function (err) {
      return next(err);
    });
}

function removeUser(req, res, next) {
  var userID = req.params.id;
  db.result('delete from userprofile where deviceid = $1', userID)
    .then(function (result) {
      res.status(200)
        .json({
          status: 'success',
          message: `Removed ${result.rowCount} user`
        });
    })
    .catch(function (err) {
      return next(err);
    });
}

function locationPick(req, res, next){
db.query('INSERT INTO locationpick(lat, lon, userid, groupid) values($1,$2,(SELECT userid FROM userprofile WHERE deviceid=$3),$4);',
[req.body.lat, req.body.lon, req.body.deviceid, req.body.groupid])
  .then(function () {
    res.status(200)
      .json({
        status: 'success',
        message: 'Done'
      });
    })
    .catch(function (err) {
      return next(err);
    });
    console.log(req.file);
}

function uploadImage(req, res, next){
db.query('INSERT INTO imagesupload(url, lat, lon, userid) values($1,$2,$3,(SELECT userid FROM userprofile WHERE deviceid=$4));',
['http://localhost:3000/images/'+req.file.filename, req.body.lat, req.body.lon, req.body.deviceid])
  .then(function () {
    res.status(200)
      .json({
        status: 'success',
        message: 'Done'
      });
    })
    .catch(function (err) {
      return next(err);
    });
    console.log(req.file);
}

/*function selectImage(req, res, next){
  db.one('select imagesupload.url, imagesupload.lat, imagesupload.lon, userprofile.username from userprofile, imagesupload where groupmember.userid=userprofile.userid and grouplist.groupid=groupmember.groupid and grouplist.usercreate= $1', [req.body.deviceid])
    .then(function (data) {
        res.status(200)
          .json({
            status: 'success',
            data: data
          });
    })
    .catch(function (err) {
      return next(err);
    });
}*/

//CIRCLE
//function createCircle

module.exports = {
  //getAllUser: getAllUser,
  updateUser: updateUser,
  removeUser: removeUser,
  updateLocation: updateLocation,
  Login: Login,
  createGroup: createGroup,
  addGroupMember: addGroupMember,
  CheckContacts: CheckContacts,
  selectGroup: selectGroup,
  uploadImage: uploadImage,
  listGroup: listGroup,
  deleteGroupMember: deleteGroupMember
};
