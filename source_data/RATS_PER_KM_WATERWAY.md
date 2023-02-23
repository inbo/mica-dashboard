For the "rats per km waterway" feature of the dashboard, we had to prepare a 1km grid dataset with, for each square, 
the length of waterways (river/stream banks + shorelines of ponds, lakes, etc.) that intersect with it.

The resulting dataset is available as a shapefile in the `source_data/rats_per_km_watrerway/grid_with_river_and_lakes_length` directory of 
this repository. The `w_idx_1` attribute contains the waterway length in meters. This data can be used to populate the 
dashboard (web application) using the `load_fishnet` management command.

# Data preparation

## Source data

The source data used is the [OSM Water Layer: Surface Waters in OpenStreetMap](http://hydro.iis.u-tokyo.ac.jp/~yamadai/OSM_water/index.html) 
dataset, by the Global Hydrodynamics lab from the university of Tokyo.
The dataset is available both as a global vector database (in OpenStreetMap PBF format) and as a raterized GeoTIFF map. 
We decided to work with the global vector database

## Data transformations

### Prepare the source dataset

#### Step 1: download the (huge) PBF file from the [OSM Water Layer: Surface Waters in OpenStreetMap](http://hydro.iis.u-tokyo.ac.jp/~yamadai/OSM_water/index.html)

Since this file covers the whole world, we need to clip/truncate it for our area of interest. A mask dataset has 
been prepared with QGIS for that purpose, and is available in the `source_data/rats_per_km_waterway/intermediate_data/be_nl_de_merged_mask.geojson`. 

#### Step 2: clip the source dataset with the mask

We use the [osmium tool](https://osmcode.org/osmium-tool/) to clip it. By convenience, we choose to run it through 
Docker:

$ docker run -it -w /wkd -v /home/nnoe/osmium_for_mica/:/wkd stefda/osmium-tool osmium
extract --polygon=be_nl_de_merged_mask.geojson -o OSM_WaterLayer.clipped.pbf OSM_WaterLayer.pbf

=> the clipped dataset is now available in the OSM_WaterLayer.clipped.pbf file

#### Step 3: convert the clipped PBF file to a shapefile

We realized that QGIS performance seemed much better with ESRI shapefiles than with PBF files. So we decided to first convert
the dataset with `ogr2ogr`:

$ ogr2ogr -skipfailures -f "ESRI Shapefile" OSM_WaterLayer.clipped.shp OSM_WaterLayer.clipped.pbf

=> we know got different shapefiles, one per geometry type (points, lines, polygons, ...). After some manual checks, we 
realize only the lines and multipolygons are relevant for us and that the other ones can be deleted.

### Generate the 1km grid

- Start QGIS, create a new project using the EPSG:8370 (Lambert 2008) for better length calculations
- We can now reuse our mask dataset for the grid generation. Import be_nl_de_merged_mask.geojson in QGIS.
- Create the grid with the "Vector / Research tools / grid" tool. We choose a 1km grid of rectangles, and we use the mask 
  dataset to set the extent of the grid.

### Compute the waterway length for each grid square

- We import the lines and multipolygons shapefiles from the OSM water layer in QGIS.
- For performance reasons, we create spatial indexes for the grid, the lines and the multipolygons layers.
- We need to convert the multipolygon layer to lines before we can do the calculations. This can be done wit h the 
"Geometry tools / Polygon to lines" tool (we have to select the option to skip/ignore invalid features).
- We can now use the "Vector / Analysis tools / sum line lengths" tool to compute the length of waterways in each grid 
square. This should be done separately for the lines and the multipolygons_as_lines layers. This gives us two new 
attributes on the grid layer: `river_len` (from lines) and `lake_len` (from multipolygons_as_lines).

### Final touches

- The "sum line length" tool has generated a new "count" attribute on the grid layer. We can remove it since we have no 
usage for it.
- Using the "Field calculator" tool, we compute two aggregated attributes: `w_idx_1` (`river_len + lakes_len`) and 
`w_idx_2` (`(river_len * 2) + lakes_lem`). In the dashboard, we initially planned to use the `w_idx_2` attribute, 
so the rivers are counted twice (two banks), which seems more relevant for this use case. After careful investigation, 
we realized that most of the time, large rivers already appear twice in the dataset (once as a line, but also once as a mulipolygon). Therefore, 
w_idx_2 appear exaggerated for those cases, and w_idx_1 seems more representative.  