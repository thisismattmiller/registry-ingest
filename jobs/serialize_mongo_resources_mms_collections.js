"use strict"

var cluster = require('cluster');


if (cluster.isMaster) {


	//mssDb 1604 test for a lot of MMS items w/ no component matches


	var mmsSeralize = require("../lib/serialize_mms_resources_utils.js")
	var serializeUtils = require("../lib/serialize_utils.js")
	var clc = require('cli-color')
	var async = require("async")


	var botCount = 4, activeBotCount = 0
	var activeRegistryID = 100000000
	var addToDbWorkQueue = []
	var workingQueue = false
	var objectsCommitedCount = 0, collectionsCompletedCount = 0
	var workLog = {}
	//1000 single item w/ capture no container


	function shuffle(array) {
	  var currentIndex = array.length, temporaryValue, randomIndex;

	  // While there remain elements to shuffle...
	  while (0 !== currentIndex) {

	    // Pick a remaining element...
	    randomIndex = Math.floor(Math.random() * currentIndex);
	    currentIndex -= 1;

	    // And swap it with the current element.
	    temporaryValue = array[currentIndex];
	    array[currentIndex] = array[randomIndex];
	    array[randomIndex] = temporaryValue;
	  }

	  return array;
	}


	
	// serializeUtils.buildTmsTriples(268691,function(){console.log("YEAHHH")})



	//the data back from the bots gets added to this queue, it enumerates them with a registry ID and then commits them to the object store
	setInterval(function(){

		process.stdout.cursorTo(0)
		process.stdout.write(clc.black.bgGreenBright("serialize MMS Collections | bots: " + activeBotCount + " queue:" + addToDbWorkQueue.length + " objects: " + objectsCommitedCount + " id: " + activeRegistryID + " cols.: " +  collectionsCompletedCount))

		if (workingQueue){
			return false
		}else{
			workingQueue = true
		}	

		if (addToDbWorkQueue.length===0){
			workingQueue = false
			return false
		}

		var objects = addToDbWorkQueue[0]
		addToDbWorkQueue.shift()

		var enumerated = serializeUtils.enumerateObjects(objects,activeRegistryID)

		activeRegistryID = enumerated.registryId

		async.each(enumerated.objects, function(object, eachCallback) {
			objectsCommitedCount++
			eachCallback()
		}, function(err){
			workingQueue = false
		})


	},10)

	setInterval(function(){

		console.log(JSON.stringify(workLog,null,2))

	},10000)




	mmsSeralize.returnAllCollectionIds(function(collectionIds){


		collectionIds = shuffle(collectionIds)
		




		var getWork = function(workId){
			if (collectionIds.length == 0){
				return "die"
			}
			var record = JSON.parse(JSON.stringify(collectionIds[0]._id))
			//delete this one
			collectionIds.shift()

			workLog[workId] = record

			return record
		}

		var buildWorker = function(){

			var worker = cluster.fork();
			console.log('Spawing worker:',worker.id)


			worker.on('message', function(msg) {
				//asking for work
				if (msg.request){					
					worker.send({ work: getWork(worker.id) })
				}
				//returning results
				if (msg.results){				

					addToDbWorkQueue.push( JSON.parse(msg.results) )
					collectionsCompletedCount++
				}
			})


			//send the first one
			worker.send({ work: getWork(worker.id) })
			activeBotCount++

		}

		for (var i = 1; i <= botCount; i++) {
			setTimeout(function(){
				buildWorker()
			}, Math.floor(Math.random() * (10000 - 0)))
		}




	})





	cluster.on('disconnect', function(worker, code, signal) {
		activeBotCount = Object.keys(cluster.workers).length
		if (Object.keys(cluster.workers).length === 1){
			setInterval(function(){
				if (addToDbWorkQueue.length===0){
					process.exit()
				}
			},10000)			
		}
	})



	

} else {
//
	
	var mmsSeralize = require("../lib/serialize_mms_resources_utils.js")

	var processRecord = function(msg){

		if (msg.work){

			if (msg.work==="die"){
				console.log("No more work, I'm leaving. 😵")
				cluster.worker.disconnect()
				process.exit()
			}

			// mmsMappingStrategies.returnMmsCollectionDetails(record,function(err,data){
			console.log("Working",msg.work)
			mmsSeralize.serializeMmsCollections(msg.work,function(objects){

				// objects.forEach(function(o){
				// 	process.send({ results: [objects] })
				// })

				//send chunks of 100
				// while(objects.length) {
				// 	console.log("Chunk")
				//     process.send({ results: objects.splice(0,100) })
				// }



				process.send({ results: JSON.stringify(objects) })
				process.send({ request: true })	

			})
		}


	}



	process.on('message', processRecord)





}