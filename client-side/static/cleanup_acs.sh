#!/bin/bash
#
# We expect the ACS 5-year data to have property names with '.'s which
# earth engine cannot handle. This script removes those '.'s from the property names.
# Here we assume ACS 5-year uses property names "GEO.id", "GEO.id2" and "GEO.display-label".

sed -i '1s/GEO.id/GEOid/' $1
sed -i '1s/GEO.id2/GEOid2/' $1
sed -i '1s/GEO.display-label/GEOdisplay-label/' $1

echo 'headers have been modified to:'
sed 1q $1
