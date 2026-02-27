terraform {
  required_version = ">= 1.4"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.82.2"
    }
  }

  backend "s3" {
    bucket         = "coffee-app-terraform-state"
    key            = "coffee-app/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "coffee-app-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  project_name = "coffee-app"

  handlers = {
    createUser      = { method = "POST", route = "/api/users" }
    loginUser       = { method = "POST", route = "/api/auth/login" }
    getUser         = { method = "GET", route = "/api/users/{username}" }
    createRating    = { method = "POST", route = "/api/ratings" }
    getUserRatings  = { method = "GET", route = "/api/users/{userId}/ratings" }
    getPlaceRatings = { method = "GET", route = "/api/places/{placeId}/ratings" }
    getPlaces       = { method = "GET", route = "/api/users/{userId}/places" }
    getPlace        = { method = "GET", route = "/api/places/{placeId}" }
    addFriend       = { method = "POST", route = "/api/friends" }
    getFriends      = { method = "GET", route = "/api/users/{userId}/friends" }
    getFollowers     = { method = "GET", route = "/api/users/{userId}/followers" }
    getCaffeineStats = { method = "GET", route = "/api/users/{userId}/caffeine" }
    getFeed         = { method = "GET", route = "/api/feed" }
    resolveCaffeine  = { method = "POST", route = "/api/drinks/resolve-caffeine", timeout = 20 }
    getPresignedUrl = { method = "POST", route = "/api/photos/upload-url" }
    toggleLike      = { method = "POST", route = "/api/ratings/{ratingId}/like" }
    getRatingDetail = { method = "GET", route = "/api/ratings/{ratingId}" }
    createComment   = { method = "POST", route = "/api/ratings/{ratingId}/comments" }
    updateRating    = { method = "PUT", route = "/api/ratings/{ratingId}" }
  }
}
