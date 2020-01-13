const { exec } = require("child_process")

const { TRAVIS_COMMIT: gitTag } = process.env;
const ACTIVE_SERVICES = [
    "client"
]

function executeShellCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error || stderr) {
                reject(error || stderr);
            } else {
                resolve(stdout);
            }
        });
    });
}

function print(str) {
    console.log(`===== ${str} =====`)
}

async function getDockerImagesByString(tag="latest") {
    const name = "hasadna/"
    const imagesString = await executeShellCommand(`docker images | grep ${tag} | awk '{print $1}' | grep ${name}`)
    const images = imagesString.split("\n")
    return images.filter((value, index, self) => {
        return self.indexOf(value) === index && value !== '';
    })
}

async function tagDockerImages() {
    const images = await getDockerImagesByString();
    const taggingProcess = images.map(image => executeShellCommand(`docker tag ${image}:latest ${image}:${gitTag}`))
    return Promise.all(taggingProcess)
}

async function getServices() {
    const images = await getDockerImagesByString();
    return images.map(image => image.replace("hasadna/open-pension-", '')).filter(service => ACTIVE_SERVICES.includes(service))
}

function pushDockerImage(imageName) {
    return executeShellCommand(`docker push ${imageName}`)
}

function pushTaggedImages(images) {
    return Promise.all(images.map(image => pushDockerImage(image)))
}

function generateUpdatesJSON(services, images) {
    const servicesJSON = services.reduce((acc, service) => {
        acc[service] = { image: images.find(image => image.includes(service)) }
        return acc;
    }, {})
    return {
        opnepension: servicesJSON
    }
}

async function main() {
    try {
        print("Running docker compose push")
        await executeShellCommand("docker-compose push")
        print("Finished Running docker compose push")
        print("Tagging images")
        await tagDockerImages()
        print("Done tagging images")
        let [taggedImages, services] = await Promise.all([
            getDockerImagesByString(gitTag),
            getServices()
        ]);
        taggedImages = taggedImages.map(image => `${image}:${gitTag}`)
        print("Pushing tagged images")
        await pushTaggedImages(taggedImages)
        print("Done pushing tagged images")
        print("Generating JSON")
        const updatesJson = JSON.stringify(generateUpdatesJSON(services, taggedImages))
        print("Done generating JSON:")
        print(`\n ${updatesJson} \n`)
        print("Setting env var")
        await executeShellCommand(`export AUTO_UPDATED=${updatesJson}`)
        print("Done setting env var")
        process.exit(0)
    } catch (e) {
        console.error(e);
        process.exit(1)
    }

}
main();
