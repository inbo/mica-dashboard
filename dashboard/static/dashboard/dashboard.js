Vue.component('dashboard-map', {
    props: {
        'occurrences': Array,

        'initialLat': Number,
        'initialLon': Number,
        'initialZoom': Number,

        'heatmapBlur': {
            type: Number,
            default: 20
        },
        'heatmapRadius': {
            type: Number,
            default: 2
        },

        'visibleLayer': String // "pointsLayer" | "clusterLayer" | "heatmapLayer"
    },
    data: function () {
        return {
            clusterStyleCache: {},
            map: null,
            vectorSource: new ol.source.Vector(),
        }
    },
    watch: {
        visibleLayer: {
            handler: function (val) {
                this.setLayerVisibility(val);
            },
        },
        heatmapBlur: {
            handler: function (val) {
                this.heatmapLayer.setBlur(val);
            },
        },
        heatmapRadius: {
            handler: function (val) {
                this.heatmapLayer.setRadius(val);
            },
        },
        occurrences: {
            handler: function (val) {
                this.vectorSource.clear(true);

                var allFeatures = []
                val.forEach(function (occ) {
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
        allLayers: function() {
            return this.map.getLayers().getArray();
        },
        dataLayers: function() {
            return this.allLayers.filter(function(l) {
                return l.get('dataLayer') == true;
            })
        },
        pointsLayer: function () {
            return this.dataLayers.find(function (l) {
                return (l.get('name') == 'pointsLayer')
            });
        },
        clusterLayer: function () {
            return this.dataLayers.find(function (l) {
                return (l.get('name') == 'clusterLayer')
            });
        },
        heatmapLayer: function () {
            return this.dataLayers.find(function (l) {
                return (l.get('name') == 'heatmapLayer')
            });
        },
    },
    methods: {
        setLayerVisibility: function (layerName) {
            this.dataLayers.forEach(function(l) {
                if(l.get('name') === layerName) {
                    l.setVisible(true);
                } else {
                    l.setVisible(false);
                }
            })
        },
        createClusterLayer: function () {
            var vm = this;

            var clusterSource = new ol.source.Cluster({
                distance: 40,
                source: this.vectorSource,
            });

            var l = new ol.layer.Vector({
                source: clusterSource,
                visible: false,
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
            l.set('name', 'clusterLayer')
            l.set('dataLayer', true);
            return l;
        },
        createHeatmapLayer: function () {
            var l = new ol.layer.Heatmap({
                source: this.vectorSource,
                visible: false,
                blur: this.heatmapBlur,
                radius: this.heatmapRadius,
            });
            l.set('name', 'heatmapLayer')
            l.set('dataLayer', true);
            return l;
        },
        createPointsLayer: function () {
            var l = new ol.layer.WebGLPoints({
                source:  this.vectorSource,
                visible: false,
                style: {
                    symbol: {
                        symbolType: 'square',
                        size: 10,
                        color: 'rgba(255,0,0,0.1)'
                    }
                }
            })
            l.set('name', 'pointsLayer')
            l.set('dataLayer', true);
            return l;
        },
        createMap: function () {
            var baseLayer = new ol.layer.Tile({
                source: new ol.source.OSM({url: "http://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"})
            })

            return new ol.Map({
                layers: [
                    baseLayer,
                    this.createClusterLayer(),
                    this.createHeatmapLayer(),
                    this.createPointsLayer()
                ],
                view: new ol.View({
                    center: ol.proj.fromLonLat([this.initialLon, this.initialLat]),
                    zoom: this.initialZoom
                })
            });
        }
    },
    mounted() {
        this.map = this.createMap();
        this.map.setTarget(this.$refs['map-root']); // Assign the map to div and display
        this.setLayerVisibility(this.visibleLayer);
        this.$emit('finished-mounting');
    },
    template: '<div id="map" class="map" ref="map-root" style="height: 640px; width: 100%;"></div>'
})