#!/usr/bin/env bash
echo "pre-commit started"

update_version(){
    npm version patch
}

# show off the old version
npm version | head -1

update_version

# show off the updated version
npm version | head -1


# track the change
git add package.json


echo "pre-commit finished"
