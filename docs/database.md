# DEC112 Border Gateway Database

The dec112 border gateway database records all components of a call.

![Border Gateway DB schema](graphics/dec112-border-db.png)


|   Table   |               Description               |
| --------- | --------------------------------------- |
| calls     | Base call data                          |
| entries   | all chat message entries for a call     |
| texts     | Text part of an entry                   |
| locations | Geolocation part of an entry            |
| data      | Additional name/value data for an entry |

