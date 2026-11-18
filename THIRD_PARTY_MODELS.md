> Los modelos y licencias se empaquetan ahora dentro del servicio `inference` con `inference/models.mjs`. FFmpeg estático 5.3.0 conserva su licencia y la del binario en `node_modules/ffmpeg-static` dentro de la imagen. El frontend ya no usa modelos.

# Modelos utilizados

- TensorFlow.js y COCO-SSD 2.2.3: Apache-2.0. Código y etiquetas: https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd . Pesos: https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json .
- Human 3.3.6: código MIT, Vladimir Mandic. https://github.com/vladmandic/human .
- BlazeFace y HSE FaceRes incluidos en Human conservan las condiciones de sus fuentes originales. Créditos: https://github.com/vladmandic/human/wiki/Models . FaceRes identifica su origen en https://github.com/HSE-asavchenko/HSE_FaceRec_tf .

`npm run models` copia las licencias distribuidas por los paquetes junto a los modelos. Las condiciones del código Human no reemplazan las de los pesos de terceros. Mantener estos créditos al distribuir la aplicación.

## Postura en el servidor

HomeGuard utiliza MoveNet MultiPose Lightning de Google mediante Human 3.3.6. Al construir la imagen se descargan el grafo y los pesos convertidos de [human-models, revisión bc66dc5](https://github.com/vladmandic/human-models/tree/bc66dc53bac03c96d35a7e6daaf717e72f3985f5/models). La imagen incluye la licencia MIT de ese repositorio. El modelo original se distribuye bajo Apache 2.0. [Ficha del modelo MoveNet](https://www.kaggle.com/models/google/movenet/tfJs/multipose-lightning)

MoveNet devuelve articulaciones de varias personas. HomeGuard estima la postura a partir de las articulaciones visibles y mantiene un identificador temporal por persona dentro de la transmisión. Una vista frontal sentada, ropa holgada o piernas ocultas pueden producir «Postura indeterminada». Para probar ambas posturas, colocar el teléfono fijo de lado o en diagonal y encuadrar de los hombros a los pies.
