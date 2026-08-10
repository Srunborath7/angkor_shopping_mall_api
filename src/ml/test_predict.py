from predict import recommend


USER_ID = "0531a6a6-385c-452e-a43a-e783163ea6ba"


results = recommend(
    USER_ID,
    count=10
)


for item in results:

    print(
        item["product_id"],
        item["score"]
    )