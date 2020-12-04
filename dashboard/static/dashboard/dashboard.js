Vue.component('dashboard-map', {
    props: ['occurrences', 'initialLat', 'initialLon', 'initialZoom', 'heatmapBlur'],
    data: function () {
        return {
            clusterStyleCache: {},
            map: null,
            vectorSource: new ol.source.Vector(),
        }
    },
    watch: {
        heatmapBlur: {
            handler: function (val, oldVal) {
                this.heatmapLayerFromMap.setBlur(parseInt(val));
            },
        },
        occurrences: {
            handler: function (val, oldVal) {
                this.vectorSource.clear(true);

                var allFeatures = []
                this.occurrences.forEach(function (occ) {
                    allFeatures.push(new ol.Feature({
                        geometry: new ol.geom.Point(ol.proj.fromLonLat([occ.lon, occ.lat]))
                    }))
                });
                this.vectorSource.addFeatures(allFeatures);

            },
            immediate: true
        },
    },
    computed: {
        clusterSource: function () {
            return new ol.source.Cluster({
                distance: 40,
                source: this.vectorSource,
            });
        },
        clusterLayer: function () {
            var vm = this;

            return new ol.layer.Vector({
                source: this.clusterSource,
                style: function (feature) {
                    var size = feature.get('features').length;
                    var style = vm.clusterStyleCache[size];
                    if (!style) {
                        style = new ol.style.Style({
                            image: new ol.style.Circle({
                                radius: 15,
                                stroke: new ol.style.Stroke({
                                    color: '#fff',
                                }),
                                fill: new ol.style.Fill({
                                    color: '#3399CC',
                                }),
                            }),
                            text: new ol.style.Text({
                                text: size.toString(),
                                fill: new ol.style.Fill({
                                    color: '#fff',
                                }),
                            }),
                        });
                        vm.clusterStyleCache[size] = style;
                    }
                    return style;
                },
            });
        },
        heatmapLayerFromMap: function() {
            console.log("getLAyers out", this.map.getLayers());
            return this.map.getLayers().getArray().find(function(l) {
                return (l.get('name') == 'heatmapLayer')
            });
        },
        heatmapLayer: function () { // For creation... replace by a simple method (then we can rename heatmapLayerFromMap -> heatmapLayer?
            var l = new ol.layer.Heatmap({
                source: this.vectorSource,
                blur: parseInt(this.heatmapBlur),
                radius: 2,
            });
            l.set('name', 'heatmapLayer')
            return l;
        },
    },
    methods: {
        getMap: function() {
            return new ol.Map({
                layers: [
                    new ol.layer.Tile({
                        source: new ol.source.OSM({url: "http://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"})
                    }),
                    this.clusterLayer,
                    this.heatmapLayer
                ],
                view: new ol.View({
                    center: ol.proj.fromLonLat([this.initialLon, this.initialLat]),
                    zoom: this.initialZoom
                })
            });
        }
    },
    mounted() {
        this.map = this.getMap();
        this.map.setTarget(this.$refs['map-root']); // Assign the map to div and display
    },
    template: '<div id="map" class="map" ref="map-root" style="height: 640px; width: 100%;"></div>'
})