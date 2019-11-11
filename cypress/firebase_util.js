export {deleteDocRecursively};

/**
 * Recursively deletes the given document and the documents under its
 * subcollections, etc.
 * @param {admin.firestore.DocumentReference} doc
 * @return {Promise} Promise that resolves when all deletions are complete
 */
function deleteDocRecursively(doc) {
  const promises = [];
  promises.push(doc.delete());
  promises.push(doc.listCollections().then((collections) => {
    const collectionPromises = [];
    for (const collection of collections) {
      collectionPromises.push(deleteCollectionRecursively(collection));
    }
    return Promise.all(collectionPromises);
  }));
  return Promise.all(promises);
}

/**
 * Recursively deletes all documents under a collection (and the documents under
 * their subcollections, etc.).
 * @param {admin.firestore.CollectionReference} collection
 * @return {Promise} Promise that resolves when all deletions are complete
 */
function deleteCollectionRecursively(collection) {
  return collection.get().then((queryResult) => {
    const promises = [];
    queryResult.forEach((doc) => promises.push(deleteDocRecursively(doc.ref)));
    return Promise.all(promises);
  });
}