#!/usr/bin/env bash
set -euo pipefail

HANDLERS=(
  createUser
  loginUser
  getUser
  createRating
  getUserRatings
  getPlaceRatings
  getPlaces
  getPlace
  addFriend
  getFriends
  getFollowers
  getCaffeineStats
  resolveCaffeine
  getFeed
  getPresignedUrl
)

DIST_DIR="dist/lambdas"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

for handler in "${HANDLERS[@]}"; do
  echo "Bundling ${handler}..."

  BUILD_DIR="${DIST_DIR}/${handler}"
  mkdir -p "$BUILD_DIR"

  npx esbuild "backend/src/handlers/${handler}.ts" \
    --bundle \
    --platform=node \
    --target=node20 \
    --outfile="${BUILD_DIR}/index.mjs" \
    --format=esm \
    --external:@aws-sdk/*

  (cd "$BUILD_DIR" && zip -q "../${handler}.zip" index.mjs)
  rm -rf "$BUILD_DIR"
done

echo "All ${#HANDLERS[@]} handlers bundled successfully."
