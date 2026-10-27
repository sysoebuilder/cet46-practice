pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "cet-foxlet"
include(":bridge", ":smoke")
if (providers.gradleProperty("dcloudSdkDir").isPresent) include(":host-app")
