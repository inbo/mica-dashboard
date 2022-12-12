Some features of this webapp rely on the 1km grid/fishnet of Belgium, here are some details about the implementation.

Intermediary and final data can be found in the source_data/grid folder.

- The grid was created in QGIS using the Vector -> Research Tools -> Vector Grid tool. 
- The grid is created using the Lambert 2008 projection (because it's perfect for Belgium and the unit is meters, so we can ask a 1km grid)
- The generated fishnet is clipped to Belgian boundaries (source: BEL_adm shapefile) (=> resulting file: grid_fixed_belgium.shp)
- We use a shapefile of waterways of Belgium (source: https://www.atlas-belgique.be/index.php/en/resources/map-data/) (saved in waterways/Navi_08)
- We use the "Sum lime length" tool to sum the length of the waterways in each grid cell. Name of the new fields: WAT_LEN and WAT_COUNT (=> resulting file: grid_fixed_belgium_waterways_length.shp)(https://gis.stackexchange.com/questions/191874/sum-line-lengths-for-each-grid-cell-in-qgis)(length is in meters)
- Data is then loaded into Django via the custom load_fishnet management command.