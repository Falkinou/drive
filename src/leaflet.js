let leafletPromise;
let clusterPromise;

export async function ensureLeaflet(withClusters = false) {
  if (!leafletPromise) {
    leafletPromise = Promise.all([
      import("leaflet"),
      import("leaflet/dist/leaflet.css"),
    ]).then(([module]) => {
      const leaflet = module.default;
      window.L = leaflet;
      return leaflet;
    });
  }

  const leaflet = await leafletPromise;
  if (withClusters && !clusterPromise) {
    clusterPromise = Promise.all([
      import("leaflet.markercluster"),
      import("leaflet.markercluster/dist/MarkerCluster.css"),
      import("leaflet.markercluster/dist/MarkerCluster.Default.css"),
    ]);
  }
  if (withClusters) await clusterPromise;
  return leaflet;
}
