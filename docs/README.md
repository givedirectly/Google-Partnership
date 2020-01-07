##Structure of asset information in firestore:

In `disaster-metadata` => `<year>` => `<disaster>` => `layers` we hold a map of \<asset path : `<data>`>

all `<data>` instances contain the following fields:
* assetType `{int}`: corresponds to the LayerType enum
* displayName `{string}`
* displayOnLoad `{boolean}`
* colorFunction `{Object}` 

### LayerType Enum:

* Feature: 0
* Feature Collection: 1
* Image: 2
* Image Collection: 3

### Color Functions
We have three types of coloring schemes: continuous, discrete, and single color. Each has a different schema for the <code>colorFunction</code> object:

#### ColorStyle Enum:

* Continuous: 0
* Discrete: 1
* Single Color: 2

**continuous:**
* currentStyle `{enum}`: set to 0
* color `{string}`: from set of known colors
* field `{string}`: name of property we're using to calculate color
* max `{number}`: max value of field
* min `{number}`: min value of field
* opacity `{number}`: opacity level

**discrete:**
* currentStyle `{enum}`: set to 1
* field `{string}`: name of property we're using to calculate color
* colors `{Map}`: map of field value `{string}` to color `{string}` (from known colors)
* opacity `{number}`

**single-color:**
* currentStyle `{enum}`: set to 2
* color `{string}`: from set of known colors
* opacity `{number}`

Note - all `color-fxn` objects have the opacity field. 

### Known Color Strings
* red
* orange
* yellow
* green
* blue
* purple
* black
* white